/**
 * Event Listeners del Service Worker
 * install, activate, fetch, message
 */

import {
    APP_SHELL_CACHE_NAME,
    APP_SHELL_FILES,
    APP_RUNTIME_CACHE_NAME,
    TILE_CACHE_NAME,
    TILE_CACHE_PREFIX,
    APP_SHELL_CACHE_PREFIX,
    APP_RUNTIME_CACHE_PREFIX,
    API_CACHE_NAME,
    API_CACHE_PREFIX,
    FAVORITE_ROUTE_CACHE_NAME,
    FAVORITE_ROUTE_CACHE_PREFIX,
    MAX_FAVORITE_ENTRIES
} from './constants.js';
import { cleanupTileCache, getTileCacheStats, clearTileCacheAndMetadata } from './handlers/tiles.js';
import { cleanupApiCache } from './handlers/api.js';
import { handleNavigationRequest } from './handlers/navigation.js';
import { handleAppAssetRequest } from './handlers/assets.js';
import { handleApiRequest } from './handlers/api.js';
import { handleTileRequest } from './handlers/tiles.js';
import { isTileRequest, isAppAssetRequest, isApiRequest } from './classifiers.js';
import { postPortMessage } from './utils.js';

/**
 * Configurar todos los listeners
 */
export function setupListeners() {
    self.addEventListener('install', handleInstall);
    self.addEventListener('activate', handleActivate);
    self.addEventListener('fetch', handleFetch);
    self.addEventListener('message', handleMessage);
}

/**
 * Install: precachear app shell
 */
function handleInstall(event) {
    event.waitUntil(precacheAppShell());
}

/**
 * Activate: limpiar caches antiguos
 */
function handleActivate(event) {
    event.waitUntil((async () => {
        await deleteOutdatedCaches();
        await cleanupTileCache({ force: true });
        await cleanupApiCache({ force: true });
        await self.clients.claim();
    })());
}

/**
 * Fetch: enrutamiento inteligente por tipo de request
 */
async function handleFetch(event) {
    const request = event.request;

    // Solo procesar GET
    if (!request || request.method !== 'GET') {
        return;
    }

    try {
        const url = new URL(request.url);

        // Navegación (HTML) - Network First
        if (request.mode === 'navigate') {
            event.respondWith(handleNavigationRequest(request));
            return;
        }

        // Tiles - Cache First
        if (isTileRequest(request)) {
            event.respondWith(handleTileRequest(event));
            return;
        }

        // API - Network First
        if (isApiRequest(request)) {
            event.respondWith(handleApiRequest(request));
            return;
        }

        // Assets - Cache First + SWR
        if (isAppAssetRequest(request)) {
            event.respondWith(handleAppAssetRequest(request, event));
            return;
        }

    } catch (_error) {
        // Ignorar errores de parsing URL
    }
}

/**
 * Message: manejar mensajes desde clients
 * - SKIP_WAITING: activar nuevo SW
 * - GET_TILE_CACHE_STATS: obtener estadísticas
 * - TRIM_TILE_CACHE: limpiar cache
 * - CLEAR_TILE_CACHE: borrar todo
 * - SET_TILE_CACHE_CONFIG: configuración
 */
function handleMessage(event) {
    const type = event?.data?.type;
    const payload = event?.data?.payload ?? {};
    const port = event.ports?.[0];

    if (!type) return;

    if (type === 'SKIP_WAITING') {
        self.skipWaiting();
        postPortMessage(port, { ok: true, type });
        return;
    }

    if (type === 'GET_TILE_CACHE_STATS') {
        event.waitUntil((async () => {
            const stats = await getTileCacheStats();
            postPortMessage(port, { ok: true, type, payload: stats });
        })());
        return;
    }

    if (type === 'TRIM_TILE_CACHE') {
        event.waitUntil((async () => {
            const stats = await cleanupTileCache({ force: true });
            postPortMessage(port, { ok: true, type, payload: stats });
        })());
        return;
    }

    if (type === 'CLEAR_TILE_CACHE') {
        event.waitUntil((async () => {
            await clearTileCacheAndMetadata();
            const stats = await getTileCacheStats();
            postPortMessage(port, { ok: true, type, payload: stats });
        })());
        return;
    }

    if (type === 'SET_TILE_CACHE_CONFIG') {
        event.waitUntil((async () => {
            if (typeof payload?.maxEntries === 'number' && payload.maxEntries > 200) {
                // Hook para fase posterior de configuracion remota.
            }
            const stats = await getTileCacheStats();
            postPortMessage(port, { ok: true, type, payload: stats });
        })());
        return;
    }

    if (type === 'TRIGGER_SYNC') {
        event.waitUntil((async () => {
            try {
                const { handleSyncMessage } = await import('./handlers/syncHandler.js');
                await handleSyncMessage(event);
            } catch (error) {
                console.error('Error en TRIGGER_SYNC:', error);
            }
        })());
        return;
    }
}

// ============================================================================
// Funciones auxiliares de listeners
// ============================================================================

/**
 * Precachear app shell durante install
 */
async function precacheAppShell() {
    const appCache = await caches.open(APP_SHELL_CACHE_NAME);

    await Promise.all(
        APP_SHELL_FILES.map(async (assetUrl) => {
            try {
                const response = await fetch(assetUrl, { cache: 'no-store' });
                if (response.ok) {
                    await appCache.put(assetUrl, response.clone());
                }
            } catch (_error) {
                // Se tolera fallo puntual de precache para no bloquear instalacion.
            }
        })
    );
}

/**
 * Eliminar caches viejos durante activate
 */
async function deleteOutdatedCaches() {
    const allCacheNames = await caches.keys();

    const outdated = allCacheNames.filter((cacheName) => {
        const isOldAppShell = cacheName.startsWith(APP_SHELL_CACHE_PREFIX) && cacheName !== APP_SHELL_CACHE_NAME;
        const isOldAppRuntime = cacheName.startsWith(APP_RUNTIME_CACHE_PREFIX) && cacheName !== APP_RUNTIME_CACHE_NAME;
        const isOldTileCache = cacheName.startsWith(TILE_CACHE_PREFIX) && cacheName !== TILE_CACHE_NAME;
        const isOldApiCache = cacheName.startsWith(API_CACHE_PREFIX) && cacheName !== API_CACHE_NAME;
        const isOldFavorite = cacheName.startsWith(FAVORITE_ROUTE_CACHE_PREFIX) && cacheName !== FAVORITE_ROUTE_CACHE_NAME;
        return isOldAppShell || isOldAppRuntime || isOldTileCache || isOldApiCache || isOldFavorite;
    });

    await Promise.all(outdated.map((cacheName) => caches.delete(cacheName)));
}

/**
 * Limpiar cache de rutas favoritas (límite: 50 máximo)
 */
let lastFavoriteCleanupAt = 0;

export async function cleanupFavoriteCache({ force = false } = {}) {
    const now = Date.now();

    if (!force && now - lastFavoriteCleanupAt < FAVORITE_CLEANUP_INTERVAL_MS) {
        return null;
    }

    lastFavoriteCleanupAt = now;

    const cache = await caches.open(FAVORITE_ROUTE_CACHE_NAME);
    const keys = await cache.keys();

    if (keys.length > MAX_FAVORITE_ENTRIES) {
        // Eliminar más antiguas primero (FIFO)
        const toDelete = keys.slice(0, keys.length - MAX_FAVORITE_ENTRIES);
        for (const request of toDelete) {
            await cache.delete(request);
        }
    }

    return {
        cacheName: FAVORITE_ROUTE_CACHE_NAME,
        totalEntries: Math.min(keys.length, MAX_FAVORITE_ENTRIES)
    };
}

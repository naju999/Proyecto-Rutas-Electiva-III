/**
 * Event Listeners del Service Worker
 * install, activate, message
 */

import {
    APP_SHELL_CACHE_NAME,
    APP_SHELL_FILES,
    TILE_CACHE_PREFIX,
    APP_SHELL_CACHE_PREFIX
} from './constants.js';
import { cleanupTileCache, getTileCacheStats, clearTileCacheAndMetadata } from './handlers/tiles.js';
import { postPortMessage } from './utils.js';

/**
 * Configurar todos los listeners
 */
export function setupListeners() {
    self.addEventListener('install', handleInstall);
    self.addEventListener('activate', handleActivate);
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
        await self.clients.claim();
    })());
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
        const isOldTileCache = cacheName.startsWith(TILE_CACHE_PREFIX) && cacheName !== `tunja-tiles-v2`;
        return isOldAppShell || isOldTileCache;
    });

    await Promise.all(outdated.map((cacheName) => caches.delete(cacheName)));
}

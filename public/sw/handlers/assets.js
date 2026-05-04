/**
 * Handler de App Assets (Cache First + stale-while-revalidate)
 * Estrategia B: App Assets (Cache First + stale-while-revalidate)
 * 1. Si está en cache => responder con cache Y refrescar en background
 * 2. Si no está en cache => ir a network
 * 3. Si network ok => cachear y devolver
 * 4. Si network falla => devolver /index.html o 503
 */

import {
    APP_RUNTIME_CACHE_NAME,
    APP_SHELL_CACHE_NAME,
    OFFLINE_FALLBACK_URL
} from '../constants.js';

/**
 * Maneja requests de assets (Cache First con SWR)
 */
export async function handleAppAssetRequest(request, event) {
    const runtimeCache = await caches.open(APP_RUNTIME_CACHE_NAME);
    const appShellCache = await caches.open(APP_SHELL_CACHE_NAME);

    // Buscar en cache primero
    const cachedResponse =
        (await runtimeCache.match(request, { ignoreSearch: true }))
        || (await appShellCache.match(request, { ignoreSearch: true }));

    if (cachedResponse) {
        // Cache First: devolver cache inmediatamente
        // Stale-While-Revalidate: refrescar en background sin bloquear
        event.waitUntil(refreshAppAsset(request, runtimeCache));
        return cachedResponse;
    }

    // No en cache => ir a network
    try {
        const networkResponse = await fetch(request);

        if (networkResponse && networkResponse.ok) {
            // Cachear para futuras solicitudes
            await runtimeCache.put(request, networkResponse.clone());
            return networkResponse;
        }

        // Network response no ok => fallback
        throw new Error('Asset network response was not ok');
    } catch (_error) {
        // Network falló => fallback específico por tipo de recurso
        return buildAssetOfflineFallback(request, appShellCache);
    }
}

/**
 * Stale-While-Revalidate para App Assets.
 * Refrescar el cache en background sin afectar respuesta actual.
 * Errores se ignoran para no degradar UX.
 */
export async function refreshAppAsset(request, runtimeCache) {
    try {
        const networkResponse = await fetch(request, { cache: 'no-store' });
        if (!networkResponse || !networkResponse.ok) {
            return;
        }

        // Actualizar cache con versión fresca
        await runtimeCache.put(request, networkResponse.clone());
    } catch (_error) {
        // Intencionalmente ignorado: SWR en background
    }
}

/**
 * Fallback offline para assets por tipo de recurso.
 * Evita devolver HTML para script/style/font, que rompe parseo en runtime.
 */
async function buildAssetOfflineFallback(request, appShellCache) {
    if (request.mode === 'navigate' || request.destination === 'document') {
        const offlinePage = await appShellCache.match(OFFLINE_FALLBACK_URL);
        if (offlinePage) {
            return offlinePage;
        }

        const fallbackIndex = await appShellCache.match('/index.html');
        if (fallbackIndex) {
            return fallbackIndex;
        }
    }

    if (request.destination === 'image') {
        const fallbackImage = await appShellCache.match('/icons/icon-192.png');
        if (fallbackImage) {
            return fallbackImage;
        }
    }

    if (request.destination === 'manifest') {
        const fallbackManifest = await appShellCache.match('/manifest.webmanifest');
        if (fallbackManifest) {
            return fallbackManifest;
        }
    }

    return new Response('Offline asset unavailable', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store'
        }
    });
}

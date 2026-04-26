/**
 * Handler de App Assets (Cache First + stale-while-revalidate)
 * Estrategia B: App Assets (Cache First + stale-while-revalidate)
 * 1. Si está en cache => responder con cache Y refrescar en background
 * 2. Si no está en cache => ir a network
 * 3. Si network ok => cachear y devolver
 * 4. Si network falla => devolver /index.html o 503
 */

import { APP_SHELL_CACHE_NAME } from '../constants.js';

/**
 * Maneja requests de assets (Cache First con SWR)
 */
export async function handleAppAssetRequest(request, event) {
    const appCache = await caches.open(APP_SHELL_CACHE_NAME);

    // Buscar en cache primero
    const cachedResponse = await appCache.match(request, { ignoreSearch: true });

    if (cachedResponse) {
        // Cache First: devolver cache inmediatamente
        // Stale-While-Revalidate: refrescar en background sin bloquear
        event.waitUntil(refreshAppAsset(request, appCache));
        return cachedResponse;
    }

    // No en cache => ir a network
    try {
        const networkResponse = await fetch(request);

        if (networkResponse && networkResponse.ok) {
            // Cachear para futuras solicitudes
            await appCache.put(request, networkResponse.clone());
            return networkResponse;
        }

        // Network response no ok => fallback
        throw new Error('Asset network response was not ok');
    } catch (_error) {
        // Network falló => fallback a /index.html o 503
        const fallback = await appCache.match('/index.html');
        if (fallback) {
            return fallback;
        }

        return new Response('', {
            status: 503,
            statusText: 'Service Unavailable'
        });
    }
}

/**
 * Stale-While-Revalidate para App Assets.
 * Refrescar el cache en background sin afectar respuesta actual.
 * Errores se ignoran para no degradar UX.
 */
export async function refreshAppAsset(request, appCache) {
    try {
        const networkResponse = await fetch(request, { cache: 'no-store' });
        if (!networkResponse || !networkResponse.ok) {
            return;
        }

        // Actualizar cache con versión fresca
        await appCache.put(request, networkResponse.clone());
    } catch (_error) {
        // Intencionalmente ignorado: SWR en background
    }
}

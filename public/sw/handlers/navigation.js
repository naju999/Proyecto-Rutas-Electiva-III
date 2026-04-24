/**
 * Handler de navegación (Network First con timeout)
 * Estrategia A: Navigation (Network First con timeout)
 * 1. Intentar network con timeout de 6s
 * 2. Si ok => cachear y devolver
 * 3. Si falla => devolver cache de la request (ignoreSearch)
 * 4. Si no hay cache => devolver cache de /index.html
 * 5. Si no hay /index.html => devolver /offline.html
 * 6. Si no hay offline.html => devolver 503 textual
 */

import {
    APP_SHELL_CACHE_NAME,
    OFFLINE_FALLBACK_URL,
    NAVIGATION_TIMEOUT_MS
} from '../constants.js';
import { fetchWithTimeout } from '../utils.js';

export async function handleNavigationRequest(request) {
    const appCache = await caches.open(APP_SHELL_CACHE_NAME);

    try {
        // Intentar network con timeout
        const networkResponse = await fetchWithTimeout(request, NAVIGATION_TIMEOUT_MS);

        if (networkResponse && networkResponse.ok) {
            // Cachear la response y /index.html para futuras navegaciones
            await appCache.put('/index.html', networkResponse.clone());
            await appCache.put(request, networkResponse.clone());
            return networkResponse;
        }

        throw new Error('Navigation network response was not ok');
    } catch (_error) {
        // Network falló o timeout => recurrir a cache

        // Intento 1: cache exact match de la request (ignoreSearch)
        const cachedNavigation = await appCache.match(request, { ignoreSearch: true });
        if (cachedNavigation) {
            return cachedNavigation;
        }

        // Intento 2: cache de /index.html (fallback SPA)
        const cachedIndex = await appCache.match('/index.html');
        if (cachedIndex) {
            return cachedIndex;
        }

        // Intento 3: offline.html como último recurso
        const offlinePage = await appCache.match(OFFLINE_FALLBACK_URL);
        if (offlinePage) {
            return offlinePage;
        }

        // Intento 4: respuesta 503 textual como fallback final
        return new Response('Offline - Cannot reach server', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Cache-Control': 'no-store'
            }
        });
    }
}

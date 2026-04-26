/**
 * Handler de API / Datos Dinámicos (Network First)
 * Estrategia D: API / Datos Dinámicos (Network First)
 * 1. Intentar network con timeout
 * 2. Si ok => cachear y devolver
 * 3. Si falla => devolver cache match
 * 4. Si no hay cache => devolver JSON vacío seguro (status 200, body '[]')
 */

import { API_CACHE_NAME, API_CACHE_TIMEOUT_MS } from '../constants.js';
import { fetchWithTimeout } from '../utils.js';

/**
 * Maneja requests de API (Network First)
 */
export async function handleApiRequest(request) {
    const apiCache = await caches.open(API_CACHE_NAME);

    try {
        // Intentar network con timeout
        const networkResponse = await fetchWithTimeout(request, API_CACHE_TIMEOUT_MS);

        if (networkResponse && networkResponse.ok) {
            // Clonar antes de cachear (consume el body)
            const clonedResponse = networkResponse.clone();
            await apiCache.put(request, clonedResponse);
            return networkResponse;
        }

        throw new Error('API network response was not ok');
    } catch (_error) {
        // Network falló => recurrir a cache

        // Intento 1: devolver cache match
        const cachedResponse = await apiCache.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }

        // Intento 2: devolver JSON vacío seguro como fallback
        // Status 200 para no confundir al cliente de que se trata de un error real
        // Body '[]' indica "lista vacía" (común en endpoints que retornan arrays)
        return new Response(JSON.stringify([]), {
            status: 200,
            statusText: 'OK',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store'
            }
        });
    }
}

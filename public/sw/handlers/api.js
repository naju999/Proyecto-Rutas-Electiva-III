/**
 * Handler de API / Datos Dinámicos (Network First)
 * Estrategia D: API / Datos Dinámicos (Network First)
 * 1. Intentar network con timeout
 * 2. Si ok => cachear y devolver
 * 3. Si falla => devolver cache match
 * 4. Si no hay cache => devolver JSON vacío seguro (status 200, body '[]')
 */

import {
    API_CACHE_NAME,
    API_CACHE_TIMEOUT_MS,
    API_CACHE_MAX_AGE_MS,
    API_CACHE_MAX_ENTRIES,
    API_CLEANUP_INTERVAL_MS
} from '../constants.js';
import { fetchWithTimeout } from '../utils.js';

let lastApiCleanupAt = 0;

/**
 * Maneja requests de API (Network First)
 */
export async function handleApiRequest(request) {
    const apiCache = await caches.open(API_CACHE_NAME);

    try {
        // Intentar network con timeout
        const networkResponse = await fetchWithTimeout(request, API_CACHE_TIMEOUT_MS);

        if (networkResponse && networkResponse.ok) {
            // Guardar una copia con metadata de tiempo para controlar expiración.
            const cacheableResponse = await buildCacheableApiResponse(networkResponse);
            await apiCache.put(request, cacheableResponse);

            // Mantenimiento ligero para evitar crecimiento sin control.
            await cleanupApiCache();
            return networkResponse;
        }

        throw new Error('API network response was not ok');
    } catch (_error) {
        // Network falló => recurrir a cache

        // Intento 1: devolver cache match
        const cachedResponse = await apiCache.match(request);
        if (cachedResponse) {
            const cachedAt = readCachedAt(cachedResponse);

            if (!isApiEntryExpired(cachedAt)) {
                return cachedResponse;
            }

            await apiCache.delete(request);
        }

        // Intento 2: fallback JSON explícito de offline (sin ocultar error real)
        return new Response(JSON.stringify({
            error: 'offline_unavailable',
            message: 'No se pudo obtener datos de red y no existe cache vigente.',
            offline: true,
            timestamp: Date.now()
        }), {
            status: 503,
            statusText: 'Service Unavailable',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
                'X-SW-Fallback': 'offline-unavailable'
            }
        });
    }
}

/**
 * Limpieza del cache de API por expiración y límite de entradas.
 */
export async function cleanupApiCache({ force = false } = {}) {
    const now = Date.now();

    if (!force && now - lastApiCleanupAt < API_CLEANUP_INTERVAL_MS) {
        return null;
    }

    lastApiCleanupAt = now;

    const apiCache = await caches.open(API_CACHE_NAME);
    const keys = await apiCache.keys();

    if (keys.length === 0) {
        return {
            cacheName: API_CACHE_NAME,
            totalBefore: 0,
            expiredDeleted: 0,
            overflowDeleted: 0,
            totalAfter: 0
        };
    }

    const entries = await Promise.all(keys.map(async (request) => {
        const response = await apiCache.match(request);
        return {
            request,
            cachedAt: readCachedAt(response)
        };
    }));

    const expiredEntries = entries.filter((entry) => isApiEntryExpired(entry.cachedAt));
    for (const entry of expiredEntries) {
        await apiCache.delete(entry.request);
    }

    const nonExpiredEntries = entries.filter((entry) => !isApiEntryExpired(entry.cachedAt));
    let overflowDeleted = 0;

    if (nonExpiredEntries.length > API_CACHE_MAX_ENTRIES) {
        const overflowCount = nonExpiredEntries.length - API_CACHE_MAX_ENTRIES;
        const sortedByOldest = [...nonExpiredEntries].sort((a, b) => a.cachedAt - b.cachedAt);
        const overflowEntries = sortedByOldest.slice(0, overflowCount);

        for (const entry of overflowEntries) {
            await apiCache.delete(entry.request);
        }

        overflowDeleted = overflowEntries.length;
    }

    const totalAfter = (await apiCache.keys()).length;

    return {
        cacheName: API_CACHE_NAME,
        totalBefore: keys.length,
        expiredDeleted: expiredEntries.length,
        overflowDeleted,
        totalAfter
    };
}

async function buildCacheableApiResponse(response) {
    try {
        const body = await response.clone().arrayBuffer();
        const headers = new Headers(response.headers);
        headers.set('sw-cached-at', String(Date.now()));

        return new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers
        });
    } catch (_error) {
        return response.clone();
    }
}

function readCachedAt(response) {
    if (!response) {
        return 0;
    }

    const explicitValue = Number(response.headers.get('sw-cached-at'));
    if (Number.isFinite(explicitValue) && explicitValue > 0) {
        return explicitValue;
    }

    const dateHeader = response.headers.get('date');
    if (!dateHeader) {
        return 0;
    }

    const parsed = Date.parse(dateHeader);
    return Number.isFinite(parsed) ? parsed : 0;
}

function isApiEntryExpired(cachedAt) {
    if (!Number.isFinite(cachedAt) || cachedAt <= 0) {
        return true;
    }

    return Date.now() - cachedAt > API_CACHE_MAX_AGE_MS;
}

/**
 * Handler de Tiles de Mapa (Cache First con metadata en IndexedDB)
 * Estrategia C: Tiles de Mapa (Cache First)
 * Reutiliza lógica existente de tiles con metadata
 */

import {
    TILE_CACHE_NAME,
    TILE_META_DB_NAME,
    TILE_META_STORE_NAME,
    TILE_META_DB_VERSION,
    MAX_TILE_ENTRIES,
    MAX_TILE_AGE_MS,
    CLEANUP_INTERVAL_MS
} from '../constants.js';

let lastCleanupAt = 0;

/**
 * Handler principal de tiles
 */
export async function handleTileRequest(event) {
    const request = event.request;
    const cache = await caches.open(TILE_CACHE_NAME);
    const cachedResponse = await cache.match(request, { ignoreVary: true });

    if (cachedResponse) {
        event.waitUntil((async () => {
            await Promise.allSettled([
                touchTileMetadata(request.url),
                refreshTileInBackground(request.clone())
            ]);
            await cleanupTileCache();
        })());

        return cachedResponse;
    }

    try {
        const networkResponse = await fetch(request);

        if (isCacheableTileResponse(networkResponse)) {
            event.waitUntil(storeTileResponse(request, networkResponse.clone()));
        }

        event.waitUntil(cleanupTileCache());
        return networkResponse;
    } catch (_error) {
        const staleResponse = await cache.match(request, { ignoreVary: true });
        if (staleResponse) {
            event.waitUntil(touchTileMetadata(request.url));
            return staleResponse;
        }

        return buildOfflineTileFallback();
    }
}

/**
 * Determina si una response de tile es cacheable
 */
function isCacheableTileResponse(response) {
    return Boolean(response && (response.ok || response.type === 'opaque'));
}

/**
 * Refrescar tile en background
 */
async function refreshTileInBackground(request) {
    try {
        const response = await fetch(request, { cache: 'no-store' });
        if (!isCacheableTileResponse(response)) return;
        await storeTileResponse(request, response);
    } catch (_error) {
        // Intencionalmente ignorado para no degradar UX offline.
    }
}

/**
 * Almacenar respuesta de tile en cache y metadata
 */
async function storeTileResponse(request, response) {
    const cache = await caches.open(TILE_CACHE_NAME);
    await cache.put(request, response.clone());

    const now = Date.now();
    const sizeBytes = await readResponseSize(response);

    await upsertTileMetadata(request.url, {
        url: request.url,
        cacheName: TILE_CACHE_NAME,
        sizeBytes,
        lastAccess: now,
        lastFetch: now,
        expiresAt: now + MAX_TILE_AGE_MS
    });
}

/**
 * Leer tamaño de una response
 */
async function readResponseSize(response) {
    try {
        if (response.type === 'opaque') {
            return 0;
        }

        const blob = await response.clone().blob();
        return Number.isFinite(blob.size) ? blob.size : 0;
    } catch (_error) {
        return 0;
    }
}

/**
 * Construir fallback SVG para tile offline
 */
function buildOfflineTileFallback() {
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#f5f7fb"/>
          <stop offset="100%" stop-color="#e4e9f3"/>
        </linearGradient>
      </defs>
      <rect width="256" height="256" fill="url(#bg)"/>
      <g fill="#5f6f88" font-family="sans-serif" text-anchor="middle">
        <text x="128" y="118" font-size="14" font-weight="700">Sin conexion</text>
        <text x="128" y="140" font-size="12">Tile no disponible en cache</text>
      </g>
    </svg>
  `;

    return new Response(svg.trim(), {
        status: 200,
        headers: {
            'Content-Type': 'image/svg+xml',
            'Cache-Control': 'no-store'
        }
    });
}

/**
 * Limpiar cache de tiles (expir y overflow)
 */
export async function cleanupTileCache({ force = false } = {}) {
    const now = Date.now();

    if (!force && now - lastCleanupAt < CLEANUP_INTERVAL_MS) {
        return null;
    }

    lastCleanupAt = now;

    const cache = await caches.open(TILE_CACHE_NAME);
    const allMetadata = await getAllTileMetadata();

    const expiredEntries = allMetadata.filter((entry) => {
        if (!entry || !entry.url) return true;
        if (entry.cacheName !== TILE_CACHE_NAME) return true;
        if (!Number.isFinite(entry.expiresAt)) return true;
        return entry.expiresAt <= now;
    });

    for (const entry of expiredEntries) {
        await cache.delete(entry.url);
        await deleteTileMetadata(entry.url);
    }

    const metadataAfterExpire = await getAllTileMetadata();
    const overflow = Math.max(0, metadataAfterExpire.length - MAX_TILE_ENTRIES);

    if (overflow > 0) {
        const orderedByLeastRecent = [...metadataAfterExpire].sort((a, b) => {
            const aAccess = Number.isFinite(a?.lastAccess) ? a.lastAccess : 0;
            const bAccess = Number.isFinite(b?.lastAccess) ? b.lastAccess : 0;
            return aAccess - bAccess;
        });

        const toDelete = orderedByLeastRecent.slice(0, overflow);

        for (const entry of toDelete) {
            await cache.delete(entry.url);
            await deleteTileMetadata(entry.url);
        }
    }

    return getTileCacheStats();
}

/**
 * Tocar metadata de tile (actualizar lastAccess)
 */
async function touchTileMetadata(url) {
    const existing = await getTileMetadata(url);
    const now = Date.now();

    if (!existing) {
        await upsertTileMetadata(url, {
            url,
            cacheName: TILE_CACHE_NAME,
            sizeBytes: 0,
            lastAccess: now,
            lastFetch: now,
            expiresAt: now + MAX_TILE_AGE_MS
        });
        return;
    }

    await upsertTileMetadata(url, {
        ...existing,
        lastAccess: now,
        expiresAt: now + MAX_TILE_AGE_MS
    });
}

/**
 * Obtener estadísticas del tile cache
 */
export async function getTileCacheStats() {
    const cache = await caches.open(TILE_CACHE_NAME);
    const requests = await cache.keys();
    const metadata = await getAllTileMetadata();

    const sizeBytes = metadata.reduce((acc, entry) => {
        const value = Number(entry?.sizeBytes);
        return Number.isFinite(value) && value > 0 ? acc + value : acc;
    }, 0);

    const unknownSizeCount = metadata.reduce((acc, entry) => {
        const value = Number(entry?.sizeBytes);
        return Number.isFinite(value) && value > 0 ? acc : acc + 1;
    }, 0);

    return {
        cacheName: TILE_CACHE_NAME,
        tileCount: requests.length,
        metadataCount: metadata.length,
        sizeBytes,
        sizeMB: Number((sizeBytes / (1024 * 1024)).toFixed(2)),
        unknownSizeCount,
        maxEntries: MAX_TILE_ENTRIES,
        maxAgeDays: Math.round(MAX_TILE_AGE_MS / (1000 * 60 * 60 * 24)),
        lastUpdated: Date.now()
    };
}

/**
 * Limpiar tile cache y metadata completamente
 */
export async function clearTileCacheAndMetadata() {
    await caches.delete(TILE_CACHE_NAME);
    await clearAllTileMetadata();
}

// ============================================================================
// IndexedDB helpers para tile metadata
// ============================================================================

function openTileMetadataDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(TILE_META_DB_NAME, TILE_META_DB_VERSION);

        request.onerror = () => reject(request.error);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            if (!db.objectStoreNames.contains(TILE_META_STORE_NAME)) {
                const store = db.createObjectStore(TILE_META_STORE_NAME, { keyPath: 'url' });
                store.createIndex('lastAccess', 'lastAccess', { unique: false });
                store.createIndex('expiresAt', 'expiresAt', { unique: false });
            }
        };

        request.onsuccess = () => resolve(request.result);
    });
}

async function withTileMetadataStore(mode, handler) {
    const db = await openTileMetadataDb();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(TILE_META_STORE_NAME, mode);
        const store = transaction.objectStore(TILE_META_STORE_NAME);

        let result;
        try {
            result = handler(store, transaction);
        } catch (error) {
            reject(error);
            db.close();
            return;
        }

        transaction.oncomplete = () => {
            db.close();
            resolve(result);
        };

        transaction.onerror = () => {
            db.close();
            reject(transaction.error);
        };

        transaction.onabort = () => {
            db.close();
            reject(transaction.error);
        };
    });
}

async function upsertTileMetadata(url, data) {
    return withTileMetadataStore('readwrite', (store) => {
        store.put({ ...data, url });
    });
}

async function getTileMetadata(url) {
    const db = await openTileMetadataDb();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(TILE_META_STORE_NAME, 'readonly');
        const store = transaction.objectStore(TILE_META_STORE_NAME);
        const request = store.get(url);

        request.onsuccess = () => {
            resolve(request.result ?? null);
        };

        request.onerror = () => {
            reject(request.error);
        };

        transaction.oncomplete = () => {
            db.close();
        };

        transaction.onerror = () => {
            db.close();
        };
    });
}

async function getAllTileMetadata() {
    const db = await openTileMetadataDb();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(TILE_META_STORE_NAME, 'readonly');
        const store = transaction.objectStore(TILE_META_STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            resolve(Array.isArray(request.result) ? request.result : []);
        };

        request.onerror = () => {
            reject(request.error);
        };

        transaction.oncomplete = () => {
            db.close();
        };

        transaction.onerror = () => {
            db.close();
        };
    });
}

async function deleteTileMetadata(url) {
    return withTileMetadataStore('readwrite', (store) => {
        store.delete(url);
    });
}

async function clearAllTileMetadata() {
    return withTileMetadataStore('readwrite', (store) => {
        store.clear();
    });
}

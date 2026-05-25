// ============================================================================
// Service Worker TuRuta v3 - MONOLÍTICO (Consolidado)
// ============================================================================
// Fecha: 25 mayo 2026
// Nota: Todos los módulos consolidados en UN SOLO archivo
// (Los Service Workers NO soportan imports de módulos ES6 en navegadores estándar)

// ============================================================================
// CONSTANTS
// ============================================================================

const SW_VERSION = 'v3';
const APP_SHELL_CACHE_NAME = `tunja-app-shell-${SW_VERSION}`;
const APP_SHELL_CACHE_PREFIX = 'tunja-app-shell-';
const APP_RUNTIME_CACHE_NAME = `tunja-app-runtime-${SW_VERSION}`;
const APP_RUNTIME_CACHE_PREFIX = 'tunja-app-runtime-';
const TILE_CACHE_NAME = `tunja-tiles-${SW_VERSION}`;
const TILE_CACHE_PREFIX = 'tunja-tiles-';
const API_CACHE_NAME = `tunja-api-${SW_VERSION}`;
const API_CACHE_PREFIX = 'tunja-api-';
const FAVORITE_ROUTE_CACHE_NAME = `tunja-favorite-routes-${SW_VERSION}`;
const FAVORITE_ROUTE_CACHE_PREFIX = 'tunja-favorite-routes-';
const OFFLINE_FALLBACK_URL = '/offline.html';

const APP_SHELL_FILES = [
  '/',
  '/index.html',
  OFFLINE_FALLBACK_URL,
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png'
];

// IndexedDB
const TILE_META_DB_NAME = 'tunjaTileCacheMeta';
const TILE_META_STORE_NAME = 'tileEntries';
const TILE_META_DB_VERSION = 1;

// Tile limits
const MAX_TILE_ENTRIES = 2500;
const MAX_TILE_AGE_MS = 1000 * 60 * 60 * 24 * 14;
const CLEANUP_INTERVAL_MS = 1000 * 60 * 5;

// Tile hosts
const TILE_HOST_MATCHERS = [
  (hostname) => hostname === 'tile.openstreetmap.org' || hostname.endsWith('.tile.openstreetmap.org'),
  (hostname) => hostname === 'tile.opentopomap.org' || hostname.endsWith('.tile.opentopomap.org'),
  (hostname) => hostname === 'basemap.nationalmap.gov'
];

// Timeouts
const NAVIGATION_TIMEOUT_MS = 6000;
const API_CACHE_TIMEOUT_MS = 8000;
const API_CACHE_MAX_AGE_MS = 1000 * 60 * 10;
const API_CACHE_MAX_ENTRIES = 120;
const API_CLEANUP_INTERVAL_MS = 1000 * 60 * 5;

// Favorite routes
const MAX_FAVORITE_ENTRIES = 50;
const FAVORITE_CLEANUP_INTERVAL_MS = 1000 * 60 * 10;

// Sync
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 5000];
const SYNC_DB_NAME = 'tunja-sync';
const SYNC_STORE_NAME = 'pending-requests';

// ============================================================================
// UTILITIES
// ============================================================================

async function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(request, {
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function postPortMessage(port, message) {
  if (!port) return;
  port.postMessage(message);
}

// ============================================================================
// CLASSIFIERS
// ============================================================================

function isTileRequest(request) {
  if (!request?.url) return false;

  let url;
  try {
    url = new URL(request.url);
  } catch (_error) {
    return false;
  }

  if (!url?.hostname) return false;

  const path = url.pathname.toLowerCase();
  const sameProtocol = url.protocol === 'https:' || url.protocol === 'http:';
  const hostMatch = TILE_HOST_MATCHERS.some((matcher) => matcher(url.hostname));
  const looksLikeTile = path.includes('/tile/') || /\/\d+\/\d+\/\d+/.test(path);
  const tileExtension = path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.jpeg') || path.endsWith('.webp');

  return sameProtocol && hostMatch && (looksLikeTile || tileExtension);
}

function isAppAssetRequest(request) {
  if (!request?.url) return false;

  let url;
  try {
    url = new URL(request.url);
  } catch (_error) {
    return false;
  }

  if (!url?.origin) return false;
  if (url.origin !== self.location.origin) return false;

  const assetDestinations = new Set(['script', 'style', 'image', 'font', 'manifest']);
  if (assetDestinations.has(request.destination)) return true;

  return url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/');
}

function isApiRequest(request) {
  if (!request?.url) return false;

  let url;
  try {
    url = new URL(request.url);
  } catch (_error) {
    return false;
  }

  if (url.origin !== self.location.origin) return false;

  const isApiPath = url.pathname.startsWith('/api/');
  const acceptsJson = (request.headers.get('accept') || '').includes('application/json');

  return isApiPath || acceptsJson;
}

// ============================================================================
// HANDLERS - NAVIGATION
// ============================================================================

async function handleNavigationRequest(request) {
  const appCache = await caches.open(APP_SHELL_CACHE_NAME);
  const url = new URL(request.url);
  const isRootNavigation = url.origin === self.location.origin && (url.pathname === '/' || url.pathname === '/index.html');

  try {
    const networkResponse = await fetchWithTimeout(request, NAVIGATION_TIMEOUT_MS);

    if (networkResponse && networkResponse.ok) {
      await appCache.put(request, networkResponse.clone());
      if (isRootNavigation) {
        await appCache.put('/index.html', networkResponse.clone());
      }
      return networkResponse;
    }

    throw new Error('Navigation network response was not ok');
  } catch (_error) {
    const cachedNavigation = await appCache.match(request, { ignoreSearch: true });
    if (cachedNavigation) return cachedNavigation;

    const cachedIndex = await appCache.match('/index.html');
    if (cachedIndex) return cachedIndex;

    const offlinePage = await appCache.match(OFFLINE_FALLBACK_URL);
    if (offlinePage) return offlinePage;

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

// ============================================================================
// HANDLERS - ASSETS
// ============================================================================

async function handleAppAssetRequest(request, event) {
  const runtimeCache = await caches.open(APP_RUNTIME_CACHE_NAME);
  const appShellCache = await caches.open(APP_SHELL_CACHE_NAME);

  const cachedResponse = (await runtimeCache.match(request, { ignoreSearch: true })) ||
    (await appShellCache.match(request, { ignoreSearch: true }));

  if (cachedResponse) {
    event.waitUntil(refreshAppAsset(request, runtimeCache));
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);

    if (networkResponse && networkResponse.ok) {
      await runtimeCache.put(request, networkResponse.clone());
      return networkResponse;
    }

    throw new Error('Asset network response was not ok');
  } catch (_error) {
    return buildAssetOfflineFallback(request, appShellCache);
  }
}

async function refreshAppAsset(request, runtimeCache) {
  try {
    const networkResponse = await fetch(request, { cache: 'no-store' });
    if (!networkResponse || !networkResponse.ok) return;
    await runtimeCache.put(request, networkResponse.clone());
  } catch (_error) {
    // Ignorado
  }
}

async function buildAssetOfflineFallback(request, appShellCache) {
  if (request.mode === 'navigate' || request.destination === 'document') {
    const offlinePage = await appShellCache.match(OFFLINE_FALLBACK_URL);
    if (offlinePage) return offlinePage;

    const fallbackIndex = await appShellCache.match('/index.html');
    if (fallbackIndex) return fallbackIndex;
  }

  if (request.destination === 'image') {
    const fallbackImage = await appShellCache.match('/icons/icon-192.png');
    if (fallbackImage) return fallbackImage;
  }

  if (request.destination === 'manifest') {
    const fallbackManifest = await appShellCache.match('/manifest.webmanifest');
    if (fallbackManifest) return fallbackManifest;
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

// ============================================================================
// HANDLERS - API
// ============================================================================

let lastApiCleanupAt = 0;

async function handleApiRequest(request) {
  const apiCache = await caches.open(API_CACHE_NAME);

  try {
    const networkResponse = await fetchWithTimeout(request, API_CACHE_TIMEOUT_MS);

    if (networkResponse && networkResponse.ok) {
      const cacheableResponse = await buildCacheableApiResponse(networkResponse);
      await apiCache.put(request, cacheableResponse);
      await cleanupApiCache();
      return networkResponse;
    }

    throw new Error('API network response was not ok');
  } catch (_error) {
    const cachedResponse = await apiCache.match(request);
    if (cachedResponse) {
      const cachedAt = readCachedAt(cachedResponse);
      if (!isApiEntryExpired(cachedAt)) {
        return cachedResponse;
      }
      await apiCache.delete(request);
    }

    return new Response(JSON.stringify({
      error: 'offline_unavailable',
      message: 'No se pudo obtener datos de red.',
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

async function cleanupApiCache({ force = false } = {}) {
  const now = Date.now();

  if (!force && now - lastApiCleanupAt < API_CLEANUP_INTERVAL_MS) {
    return null;
  }

  lastApiCleanupAt = now;

  const apiCache = await caches.open(API_CACHE_NAME);
  const keys = await apiCache.keys();

  if (keys.length === 0) return null;

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

  if (nonExpiredEntries.length > API_CACHE_MAX_ENTRIES) {
    const overflowCount = nonExpiredEntries.length - API_CACHE_MAX_ENTRIES;
    const sortedByOldest = [...nonExpiredEntries].sort((a, b) => a.cachedAt - b.cachedAt);
    const overflowEntries = sortedByOldest.slice(0, overflowCount);

    for (const entry of overflowEntries) {
      await apiCache.delete(entry.request);
    }
  }
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
    return response;
  }
}

function readCachedAt(response) {
  const cachedAt = response?.headers?.get('sw-cached-at');
  return cachedAt ? Number(cachedAt) : 0;
}

function isApiEntryExpired(cachedAt) {
  return Date.now() - cachedAt > API_CACHE_MAX_AGE_MS;
}

// ============================================================================
// HANDLERS - TILES
// ============================================================================

let lastCleanupAt = 0;

async function handleTileRequest(event) {
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

function isCacheableTileResponse(response) {
  return Boolean(response && (response.ok || response.type === 'opaque'));
}

async function refreshTileInBackground(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (!isCacheableTileResponse(response)) return;
    await storeTileResponse(request, response);
  } catch (_error) {
    // Ignorado
  }
}

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

async function readResponseSize(response) {
  try {
    if (response.type === 'opaque') return 0;
    const blob = await response.clone().blob();
    return Number.isFinite(blob.size) ? blob.size : 0;
  } catch (_error) {
    return 0;
  }
}

function buildOfflineTileFallback() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f5f7fb"/>
      <stop offset="100%" stop-color="#e4e9f3"/>
    </linearGradient></defs>
    <rect width="256" height="256" fill="url(#bg)"/>
    <g fill="#5f6f88" font-family="sans-serif" text-anchor="middle">
      <text x="128" y="118" font-size="14" font-weight="700">Sin conexion</text>
      <text x="128" y="140" font-size="12">Tile no disponible</text>
    </g></svg>`;

  return new Response(svg.trim(), {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'no-store'
    }
  });
}

async function cleanupTileCache({ force = false } = {}) {
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
}

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

// ============================================================================
// IndexedDB Helpers - Tiles
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

// ============================================================================
// SYNC HANDLER
// ============================================================================

async function handleSyncMessage(event) {
  try {
    const queue = await getSyncQueue();

    if (!queue || queue.length === 0) {
      return;
    }

    for (const item of queue) {
      let retryCount = 0;
      let success = false;

      while (retryCount < MAX_RETRIES && !success) {
        try {
          const response = await sendRequest(item);

          if (response.success) {
            await removeQueueItem(item.id);
            success = true;

            await notifyClientsSync({
              itemId: item.id,
              status: 'completed',
              url: item.url
            });
          } else {
            throw new Error(`HTTP ${response.status}`);
          }
        } catch (error) {
          retryCount++;

          if (retryCount < MAX_RETRIES) {
            await sleep(RETRY_DELAYS[retryCount - 1]);
          } else {
            await updateQueueItemStatus(item.id, 'failed', error.message);

            await notifyClientsSync({
              itemId: item.id,
              status: 'failed',
              url: item.url,
              error: error.message
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('Error en handleSyncMessage:', error);
  }
}

async function getSyncQueue() {
  try {
    const db = await openSyncDb();

    return new Promise((resolve) => {
      const transaction = db.transaction([SYNC_STORE_NAME], 'readonly');
      const store = transaction.objectStore(SYNC_STORE_NAME);
      const index = store.index('status');
      const request = index.getAll('pending');

      request.onsuccess = () => {
        db.close();
        resolve(request.result || []);
      };

      request.onerror = () => {
        db.close();
        resolve([]);
      };
    });
  } catch (_error) {
    return [];
  }
}

async function updateQueueItemStatus(id, status, error = null) {
  try {
    const db = await openSyncDb();

    return new Promise((resolve) => {
      const transaction = db.transaction([SYNC_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(SYNC_STORE_NAME);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const item = getRequest.result;
        if (!item) {
          db.close();
          resolve(null);
          return;
        }

        item.status = status;
        item.lastUpdated = Date.now();
        if (error) item.lastError = error;

        const putRequest = store.put(item);

        putRequest.onsuccess = () => {
          db.close();
          resolve(item);
        };

        putRequest.onerror = () => {
          db.close();
          resolve(null);
        };
      };
    });
  } catch (_error) {
    return null;
  }
}

async function removeQueueItem(id) {
  try {
    const db = await openSyncDb();

    return new Promise((resolve) => {
      const transaction = db.transaction([SYNC_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(SYNC_STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => {
        db.close();
        resolve(true);
      };

      request.onerror = () => {
        db.close();
        resolve(false);
      };
    });
  } catch (_error) {
    return false;
  }
}

async function sendRequest(item) {
  const response = await fetch(item.url, {
    method: item.method || 'POST',
    headers: item.headers || {},
    body: item.body,
    cache: 'no-store'
  });

  return {
    success: response.ok,
    status: response.status,
    statusText: response.statusText
  };
}

async function notifyClientsSync(data) {
  try {
    const clients = await self.clients.matchAll();
    for (const client of clients) {
      client.postMessage({
        type: 'SYNC_RESULT',
        payload: data
      });
    }
  } catch (_error) {
    // Ignorar si no hay clientes
  }
}

function openSyncDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SYNC_DB_NAME, 1);

    request.onerror = () => reject(request.error);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(SYNC_STORE_NAME)) {
        const store = db.createObjectStore(SYNC_STORE_NAME, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// PRECACHE & CLEANUP
// ============================================================================

async function precacheAppShell() {
  const cache = await caches.open(APP_SHELL_CACHE_NAME);
  return cache.addAll(APP_SHELL_FILES);
}

async function deleteOutdatedCaches() {
  const cacheNames = await caches.keys();
  const keysToDelete = cacheNames.filter((name) => {
    return (
      name.startsWith(APP_SHELL_CACHE_PREFIX) ||
      name.startsWith(APP_RUNTIME_CACHE_PREFIX) ||
      name.startsWith(TILE_CACHE_PREFIX) ||
      name.startsWith(API_CACHE_PREFIX) ||
      name.startsWith(FAVORITE_ROUTE_CACHE_PREFIX)
    ) && !name.includes(SW_VERSION);
  });

  return Promise.all(keysToDelete.map((name) => caches.delete(name)));
}

async function cleanupFavoriteCache() {
  const cache = await caches.open(FAVORITE_ROUTE_CACHE_NAME);
  const keys = await cache.keys();

  if (keys.length > MAX_FAVORITE_ENTRIES) {
    const excess = keys.length - MAX_FAVORITE_ENTRIES;
    for (let i = 0; i < excess; i++) {
      await cache.delete(keys[i]);
    }
  }
}

// ============================================================================
// MAIN LISTENERS
// ============================================================================

self.addEventListener('install', (event) => {
  event.waitUntil(precacheAppShell());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await deleteOutdatedCaches();
    await cleanupTileCache({ force: true });
    await cleanupApiCache({ force: true });
    await cleanupFavoriteCache();
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (!request || request.method !== 'GET') {
    return;
  }

  try {
    // Navegación
    if (request.mode === 'navigate') {
      event.respondWith(handleNavigationRequest(request));
      return;
    }

    // Tiles
    if (isTileRequest(request)) {
      event.respondWith(handleTileRequest(event));
      return;
    }

    // API
    if (isApiRequest(request)) {
      event.respondWith(handleApiRequest(request));
      return;
    }

    // Assets
    if (isAppAssetRequest(request)) {
      event.respondWith(handleAppAssetRequest(request, event));
      return;
    }
  } catch (_error) {
    // Ignorar errores de parsing
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'TRIGGER_SYNC') {
    handleSyncMessage(event);
  }
});

// ============================================================================
// FIN - Service Worker v3 Monolítico
// ============================================================================

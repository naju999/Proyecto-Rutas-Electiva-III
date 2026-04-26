const SW_VERSION = 'v2';

const APP_SHELL_CACHE_NAME = `tunja-app-shell-${SW_VERSION}`;
const APP_SHELL_CACHE_PREFIX = 'tunja-app-shell-';
const TILE_CACHE_NAME = `tunja-tiles-${SW_VERSION}`;
const TILE_CACHE_PREFIX = 'tunja-tiles-';

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

const TILE_META_DB_NAME = 'tunjaTileCacheMeta';
const TILE_META_STORE_NAME = 'tileEntries';
const TILE_META_DB_VERSION = 1;

const MAX_TILE_ENTRIES = 2500;
const MAX_TILE_AGE_MS = 1000 * 60 * 60 * 24 * 14;
const CLEANUP_INTERVAL_MS = 1000 * 60 * 5;

const TILE_HOST_MATCHERS = [
  (hostname) => hostname === 'tile.openstreetmap.org' || hostname.endsWith('.tile.openstreetmap.org'),
  (hostname) => hostname === 'tile.opentopomap.org' || hostname.endsWith('.tile.opentopomap.org'),
  (hostname) => hostname === 'basemap.nationalmap.gov'
];

let lastCleanupAt = 0;

self.addEventListener('install', (event) => {
  event.waitUntil(precacheAppShell());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await deleteOutdatedCaches();
    await cleanupTileCache({ force: true });
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (!request || request.method !== 'GET') {
    return;
  }

  if (isTileRequest(request)) {
    event.respondWith(handleTileRequest(event));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  if (isAppAssetRequest(request)) {
    event.respondWith(handleAppAssetRequest(request, event));
  }
});

self.addEventListener('message', (event) => {
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
});

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

async function deleteOutdatedCaches() {
  const allCacheNames = await caches.keys();

  const outdated = allCacheNames.filter((cacheName) => {
    const isOldAppShell = cacheName.startsWith(APP_SHELL_CACHE_PREFIX) && cacheName !== APP_SHELL_CACHE_NAME;
    const isOldTileCache = cacheName.startsWith(TILE_CACHE_PREFIX) && cacheName !== TILE_CACHE_NAME;
    return isOldAppShell || isOldTileCache;
  });

  await Promise.all(outdated.map((cacheName) => caches.delete(cacheName)));
}

function isTileRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname.toLowerCase();

  const sameProtocol = url.protocol === 'https:' || url.protocol === 'http:';
  const hostMatch = TILE_HOST_MATCHERS.some((matcher) => matcher(url.hostname));
  const looksLikeTile = path.includes('/tile/') || /\/\d+\/\d+\/\d+/.test(path);
  const tileExtension = path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.jpeg') || path.endsWith('.webp');

  return sameProtocol && hostMatch && (looksLikeTile || tileExtension);
}

function isAppAssetRequest(request) {
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return false;
  }

  const assetDestinations = new Set(['script', 'style', 'image', 'font', 'manifest']);
  if (assetDestinations.has(request.destination)) {
    return true;
  }

  return (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/data/')
  );
}

async function handleNavigationRequest(request) {
  const appCache = await caches.open(APP_SHELL_CACHE_NAME);

  try {
    const networkResponse = await fetchWithTimeout(request, 6000);

    if (networkResponse && networkResponse.ok) {
      await appCache.put('/index.html', networkResponse.clone());
      await appCache.put(request, networkResponse.clone());
      return networkResponse;
    }

    throw new Error('Navigation fetch failed');
  } catch (_error) {
    const cachedNavigation = await appCache.match(request, { ignoreSearch: true });
    if (cachedNavigation) {
      return cachedNavigation;
    }

    const cachedIndex = await appCache.match('/index.html');
    if (cachedIndex) {
      return cachedIndex;
    }

    const offlinePage = await appCache.match(OFFLINE_FALLBACK_URL);
    if (offlinePage) {
      return offlinePage;
    }

    return new Response('Offline', {
      status: 503,
      statusText: 'Offline',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  }
}

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

async function handleAppAssetRequest(request, event) {
  const appCache = await caches.open(APP_SHELL_CACHE_NAME);
  const cachedResponse = await appCache.match(request, { ignoreSearch: true });

  if (cachedResponse) {
    event.waitUntil(refreshAppAsset(request));
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);

    if (networkResponse && networkResponse.ok) {
      await appCache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (_error) {
    const fallback = await appCache.match('/index.html');
    if (fallback) {
      return fallback;
    }

    return new Response('', {
      status: 503,
      statusText: 'Offline'
    });
  }
}

async function refreshAppAsset(request) {
  try {
    const networkResponse = await fetch(request, { cache: 'no-store' });
    if (!networkResponse || !networkResponse.ok) return;

    const appCache = await caches.open(APP_SHELL_CACHE_NAME);
    await appCache.put(request, networkResponse.clone());
  } catch (_error) {
    // Se ignora para no afectar respuesta cacheada actual.
  }
}

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
    // Intencionalmente ignorado para no degradar UX offline.
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
    if (response.type === 'opaque') {
      return 0;
    }

    const blob = await response.clone().blob();
    return Number.isFinite(blob.size) ? blob.size : 0;
  } catch (_error) {
    return 0;
  }
}

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

  return getTileCacheStats();
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

async function getTileCacheStats() {
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

async function clearTileCacheAndMetadata() {
  await caches.delete(TILE_CACHE_NAME);
  await clearAllTileMetadata();
}

function postPortMessage(port, message) {
  if (!port) return;
  port.postMessage(message);
}

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

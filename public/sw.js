const SW_VERSION = 'v2';

const APP_SHELL_CACHE_NAME = `tunja-app-shell-${SW_VERSION}`;
const APP_SHELL_CACHE_PREFIX = 'tunja-app-shell-';
const TILE_CACHE_NAME = `tunja-tiles-${SW_VERSION}`;
const TILE_CACHE_PREFIX = 'tunja-tiles-';
const API_CACHE_NAME = `tunja-api-v1`;

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

// ============================================================================
// FETCH EVENT HANDLER CON 4 ESTRATEGIAS
// ============================================================================
// - Navigations (Network First + timeout)
// - App Assets (Cache First + stale-while-revalidate)
// - Tiles de Mapa (Cache First con metadata en IndexedDB)
// - API/Datos Dinámicos (Network First)
// ============================================================================

const NAVIGATION_TIMEOUT_MS = 6000;
const API_CACHE_TIMEOUT_MS = 8000;

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Regla 1: Interceptar SOLO requests GET
  if (!request || request.method !== 'GET') {
    return; // No respondWith => pasar al network naturalmente
  }

  // Regla 2: No interceptar si request.cache === 'only-if-cached' y mode !== 'same-origin'
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') {
    return;
  }

  // Clasificar y delegar por tipo de request

  // Tipo C: Tiles de Mapa (Externos permitidos, Cache First)
  if (isTileRequest(request)) {
    event.respondWith(handleTileRequest(event));
    return;
  }

  // Tipo A: Navigations (Network First con timeout)
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  // Tipo B: App Assets (Cache First + stale-while-revalidate)
  if (isAppAssetRequest(request)) {
    event.respondWith(handleAppAssetRequest(request, event));
    return;
  }

  // Tipo D: API / Datos Dinámicos (Network First)
  if (isApiRequest(request)) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  // Cualquier otro request: no interceptar (pasar al network)
});

// ============================================================================
// FUNCIONES CLASIFICADORAS
// ============================================================================

/**
 * Detecta si una request es para un tile de mapa.
 * Valida:
 * - Protocolo http/https
 * - Hostname en allowlist (tile.openstreetmap.org, tile.opentopomap.org, etc.)
 * - Path/extension indica tile (contiene "/tile/", patrón /z/x/y, o extensión .png/.jpg/.webp)
 */
function isTileRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname.toLowerCase();

  const sameProtocol = url.protocol === 'https:' || url.protocol === 'http:';

  // Validar que el hostname esté en la allowlist de tiles
  const hostMatch = TILE_HOST_MATCHERS.some((matcher) => matcher(url.hostname));

  // Detectar por path o extensión
  const looksLikeTile = path.includes('/tile/') || /\/\d+\/\d+\/\d+/.test(path);
  const tileExtension = path.endsWith('.png') || path.endsWith('.jpg')
    || path.endsWith('.jpeg') || path.endsWith('.webp');

  return sameProtocol && hostMatch && (looksLikeTile || tileExtension);
}

/**
 * Detecta si una request es un asset de la aplicación (Vite build output + icons + manifest).
 * Validar que sea mismo origen.
 */
function isAppAssetRequest(request) {
  const url = new URL(request.url);

  // Solo assets del mismo origen
  if (url.origin !== self.location.origin) {
    return false;
  }

  // Validar por destination (navegador lo establece automáticamente)
  const assetDestinations = new Set(['script', 'style', 'image', 'font', 'manifest']);
  if (assetDestinations.has(request.destination)) {
    return true;
  }

  // Validar por path (/assets/* es salida de Vite)
  return url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/');
}

/**
 * Detecta si una request es para API / datos dinámicos.
 * Criterios:
 * - Mismo origen que el SW (self.location.origin)
 * - Y CUALQUIERA de:
 *   - Path comienza con /api/
 *   - Header 'accept' contiene 'application/json'
 */
function isApiRequest(request) {
  const url = new URL(request.url);

  // Solo datos dinámicos del mismo origen
  if (url.origin !== self.location.origin) {
    return false;
  }

  // Criterio 1: Path comienza con /api/
  if (url.pathname.startsWith('/api/')) {
    return true;
  }

  // Criterio 2: Header 'accept' menciona application/json
  const acceptHeader = request.headers.get('accept') || '';
  if (acceptHeader.includes('application/json')) {
    return true;
  }

  return false;
}

// ============================================================================
// MANEJADORES POR TIPO DE REQUEST
// ============================================================================

/**
 * Estrategia A: Navigation (Network First con timeout)
 * 1. Intentar network con timeout de 6s
 * 2. Si ok => cachear y devolver
 * 3. Si falla => devolver cache de la request (ignoreSearch)
 * 4. Si no hay cache => devolver cache de /index.html
 * 5. Si no hay /index.html => devolver /offline.html
 * 6. Si no hay offline.html => devolver 503 textual
 */
async function handleNavigationRequest(request) {
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

/**
 * Estrategia B: App Assets (Cache First + stale-while-revalidate)
 * 1. Si está en cache => responder con cache Y refrescar en background
 * 2. Si no está en cache => ir a network
 * 3. Si network ok => cachear y devolver
 * 4. Si network falla => devolver /index.html o 503
 */
async function handleAppAssetRequest(request, event) {
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
async function refreshAppAsset(request, appCache) {
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

/**
 * Estrategia D: API / Datos Dinámicos (Network First)
 * 1. Intentar network con timeout
 * 2. Si ok => cachear y devolver
 * 3. Si falla => devolver cache match
 * 4. Si no hay cache => devolver JSON vacío seguro (status 200, body '[]')
 */
async function handleApiRequest(request) {
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

/**
 * Ejecutar fetch con timeout.
 * Usa AbortController para cancelar después de timeoutMs.
 */
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

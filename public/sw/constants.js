/**
 * Constants para el Service Worker
 * Versión, nombres de caché, configuración de tiles, etc.
 */

export const SW_VERSION = 'v2';

// Cache Names
export const APP_SHELL_CACHE_NAME = `tunja-app-shell-${SW_VERSION}`;
export const APP_SHELL_CACHE_PREFIX = 'tunja-app-shell-';
export const TILE_CACHE_NAME = `tunja-tiles-${SW_VERSION}`;
export const TILE_CACHE_PREFIX = 'tunja-tiles-';
export const API_CACHE_NAME = `tunja-api-v1`;

// Offline fallback
export const OFFLINE_FALLBACK_URL = '/offline.html';

// App Shell Files para precache
export const APP_SHELL_FILES = [
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

// IndexedDB config para tile metadata
export const TILE_META_DB_NAME = 'tunjaTileCacheMeta';
export const TILE_META_STORE_NAME = 'tileEntries';
export const TILE_META_DB_VERSION = 1;

// Tile cache limits
export const MAX_TILE_ENTRIES = 2500;
export const MAX_TILE_AGE_MS = 1000 * 60 * 60 * 24 * 14; // 14 días
export const CLEANUP_INTERVAL_MS = 1000 * 60 * 5; // 5 minutos

// Tile host allowlist matchers
export const TILE_HOST_MATCHERS = [
    (hostname) => hostname === 'tile.openstreetmap.org' || hostname.endsWith('.tile.openstreetmap.org'),
    (hostname) => hostname === 'tile.opentopomap.org' || hostname.endsWith('.tile.opentopomap.org'),
    (hostname) => hostname === 'basemap.nationalmap.gov'
];

// Fetch timeouts
export const NAVIGATION_TIMEOUT_MS = 6000;
export const API_CACHE_TIMEOUT_MS = 8000;

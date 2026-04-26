/**
 * Funciones clasificadoras de requests
 * Determinan qué estrategia aplicar a cada request
 */

import { TILE_HOST_MATCHERS } from './constants.js';

/**
 * Detecta si una request es para un tile de mapa.
 * Valida:
 * - Protocolo http/https
 * - Hostname en allowlist (tile.openstreetmap.org, tile.opentopomap.org, etc.)
 * - Path/extension indica tile (contiene "/tile/", patrón /z/x/y, o extensión .png/.jpg/.webp)
 */
export function isTileRequest(request) {
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
export function isAppAssetRequest(request) {
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
export function isApiRequest(request) {
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

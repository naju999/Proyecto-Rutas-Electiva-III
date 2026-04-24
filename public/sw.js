/**
 * Service Worker - Punto de entrada
 * Modularizado en:
 * - sw/constants.js      : Constantes
 * - sw/utils.js          : Funciones utilitarias
 * - sw/classifiers.js    : Clasificadores de requests
 * - sw/handlers/         : Manejadores por estrategia
 * - sw/listeners.js      : Event listeners (install, activate, message)
 */

import {
  NAVIGATION_TIMEOUT_MS,
  API_CACHE_TIMEOUT_MS
} from './sw/constants.js';

import {
  isTileRequest,
  isAppAssetRequest,
  isApiRequest
} from './sw/classifiers.js';

import { handleNavigationRequest } from './sw/handlers/navigation.js';
import { handleAppAssetRequest } from './sw/handlers/assets.js';
import { handleApiRequest } from './sw/handlers/api.js';
import { handleTileRequest } from './sw/handlers/tiles.js';
import { setupListeners } from './sw/listeners.js';

// ============================================================================
// FETCH EVENT HANDLER CON 4 ESTRATEGIAS
// ============================================================================
// - Navigations (Network First + timeout)
// - App Assets (Cache First + stale-while-revalidate)
// - Tiles de Mapa (Cache First con metadata en IndexedDB)
// - API/Datos Dinámicos (Network First)
// ============================================================================

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

// Configurar listeners (install, activate, message)
setupListeners();

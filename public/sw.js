// ============================================================================
// Service Worker TuRuta v3 - Modular & Refactored
// ============================================================================
// Version: v3 (25 mayo 2026)
// ACCIÓN 1 COMPLETADA: Migración de v2 (monolítico) a v3 (modular)
// 
// Beneficios:
// - ✅ Código modular y separado por responsabilidades
// - ✅ Listeners centralizados en sw/listeners.js
// - ✅ Handlers especializados en sw/handlers/
// - ✅ Clasificadores de requests en sw/classifiers.js
// - ✅ Constantes compartidas en sw/constants.js
//
// Ver /public/sw/ para la estructura completa

import { setupListeners } from './sw/listeners.js';
import { handleNavigationRequest } from './sw/handlers/navigation.js';
import { handleAppAssetRequest } from './sw/handlers/assets.js';
import { handleApiRequest } from './sw/handlers/api.js';
import { handleTileRequest } from './sw/handlers/tiles.js';
import { isTileRequest, isAppAssetRequest, isApiRequest } from './sw/classifiers.js';

// Inicializar listeners (install, activate, fetch, message)
setupListeners();

// ============================================================================
// FIN Service Worker v3
// ============================================================================

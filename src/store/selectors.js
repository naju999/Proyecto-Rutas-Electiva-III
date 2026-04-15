export const selectUIState = (state) => state.ui;
export const selectMapState = (state) => state.map;
export const selectCacheState = (state) => state.cache;

export const selectHomeOverlayCollapsed = (state) => state.ui.homeOverlayCollapsed;
export const selectRoutesSheetCollapsed = (state) => state.ui.routesSheetCollapsed;

export const selectCurrentLayer = (state) => state.map.currentLayer;
export const selectShowBusA1 = (state) => state.map.showBusA1;
export const selectCoordinates = (state) => state.map.coordinates;
export const selectMapWarning = (state) => state.map.warning;

export const selectCacheOfflineMode = (state) => state.cache.offlineMode;
export const selectCacheStats = (state) => state.cache.stats;

export const selectUIState = (state) => state.ui;
export const selectMapState = (state) => state.map;
export const selectCacheState = (state) => state.cache;

export const selectHomeOverlayCollapsed = (state) => state.ui.homeOverlayCollapsed;
export const selectRoutesSheetCollapsed = (state) => state.ui.routesSheetCollapsed;

export const selectCurrentLayer = (state) => state.map.currentLayer;
export const selectSelectedRoute = (state) => state.map.selectedRoute;
export const selectCoordinates = (state) => state.map.coordinates;
export const selectMapWarning = (state) => state.map.warning;

export const selectFavoriteRoutes = (state) => state.favorites.items;
export const selectFavoriteTripRoutes = (state) =>
  state.favorites.items.filter((item) => item.type === 'trip');
export const selectIsRouteFavorite = (state, routeId) =>
	state.favorites.items.some((route) => route.id === routeId);

export const selectCacheOfflineMode = (state) => state.cache.offlineMode;
export const selectCacheStats = (state) => state.cache.stats;

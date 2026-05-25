export const ACTION_TYPES = {
  ui: {
    toggleHomeOverlayCollapsed: 'ui/toggleHomeOverlayCollapsed',
    setHomeOverlayCollapsed: 'ui/setHomeOverlayCollapsed',
    toggleRoutesSheetCollapsed: 'ui/toggleRoutesSheetCollapsed',
    setRoutesSheetCollapsed: 'ui/setRoutesSheetCollapsed'
  },
  map: {
    setCurrentLayer: 'map/setCurrentLayer',
    setSelectedRoute: 'map/setSelectedRoute',
    setCoordinates: 'map/setCoordinates',
    setWarning: 'map/setWarning'
  },
  favorites: {
    setFavorites: 'favorites/setFavorites',
    clearFavorites: 'favorites/clearFavorites',
    toggleFavorite: 'favorites/toggleFavorite',
    toggleFavoriteTripRoute: 'favorites/toggleFavoriteTripRoute'
  },
  cache: {
    setOfflineMode: 'cache/setOfflineMode',
    updateStats: 'cache/updateStats'
  }
};

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
  cache: {
    setOfflineMode: 'cache/setOfflineMode',
    updateStats: 'cache/updateStats'
  }
};

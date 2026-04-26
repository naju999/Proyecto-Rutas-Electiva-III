import { ACTION_TYPES } from './actionTypes';

export const uiActions = {
  toggleHomeOverlayCollapsed: () => ({
    type: ACTION_TYPES.ui.toggleHomeOverlayCollapsed
  }),
  setHomeOverlayCollapsed: (value) => ({
    type: ACTION_TYPES.ui.setHomeOverlayCollapsed,
    payload: value
  }),
  toggleRoutesSheetCollapsed: () => ({
    type: ACTION_TYPES.ui.toggleRoutesSheetCollapsed
  }),
  setRoutesSheetCollapsed: (value) => ({
    type: ACTION_TYPES.ui.setRoutesSheetCollapsed,
    payload: value
  })
};

export const mapActions = {
  setCurrentLayer: (layer) => ({
    type: ACTION_TYPES.map.setCurrentLayer,
    payload: layer
  }),
  setShowBusA1: (value) => ({
    type: ACTION_TYPES.map.setShowBusA1,
    payload: value
  }),
  setCoordinates: (lat, lng) => ({
    type: ACTION_TYPES.map.setCoordinates,
    payload: { lat, lng }
  }),
  setWarning: (warning) => ({
    type: ACTION_TYPES.map.setWarning,
    payload: warning
  })
};

export const cacheActions = {
  setOfflineMode: (value) => ({
    type: ACTION_TYPES.cache.setOfflineMode,
    payload: value
  }),
  updateStats: (stats) => ({
    type: ACTION_TYPES.cache.updateStats,
    payload: stats
  })
};

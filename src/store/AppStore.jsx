import { createContext, useContext, useReducer } from 'react';
import { ACTION_TYPES } from './actionTypes';

const VALID_MAP_LAYERS = new Set(['openstreetmap', 'satellite', 'terrain']);

export const initialState = {
  ui: {
    homeOverlayCollapsed: false,
    routesSheetCollapsed: false
  },
  map: {
    currentLayer: 'openstreetmap',
    showBusA1: false,
    coordinates: {
      lat: 5.5277,
      lng: -73.3639
    },
    warning: ''
  },
  cache: {
    offlineMode: false,
    stats: {
      tileCount: 0,
      sizeMB: 0,
      lastUpdated: null
    }
  }
};

function appReducer(state, action) {
  switch (action.type) {
    case ACTION_TYPES.ui.toggleHomeOverlayCollapsed:
      return {
        ...state,
        ui: {
          ...state.ui,
          homeOverlayCollapsed: !state.ui.homeOverlayCollapsed
        }
      };

    case ACTION_TYPES.ui.setHomeOverlayCollapsed:
      return {
        ...state,
        ui: {
          ...state.ui,
          homeOverlayCollapsed: Boolean(action.payload)
        }
      };

    case ACTION_TYPES.ui.toggleRoutesSheetCollapsed:
      return {
        ...state,
        ui: {
          ...state.ui,
          routesSheetCollapsed: !state.ui.routesSheetCollapsed
        }
      };

    case ACTION_TYPES.ui.setRoutesSheetCollapsed:
      return {
        ...state,
        ui: {
          ...state.ui,
          routesSheetCollapsed: Boolean(action.payload)
        }
      };

    case ACTION_TYPES.map.setCurrentLayer: {
      const nextLayer = VALID_MAP_LAYERS.has(action.payload)
        ? action.payload
        : state.map.currentLayer;

      return {
        ...state,
        map: {
          ...state.map,
          currentLayer: nextLayer
        }
      };
    }

    case ACTION_TYPES.map.setShowBusA1:
      return {
        ...state,
        map: {
          ...state.map,
          showBusA1: Boolean(action.payload)
        }
      };

    case ACTION_TYPES.map.setCoordinates:
      return {
        ...state,
        map: {
          ...state.map,
          coordinates: {
            lat: Number(action.payload?.lat ?? state.map.coordinates.lat),
            lng: Number(action.payload?.lng ?? state.map.coordinates.lng)
          }
        }
      };

    case ACTION_TYPES.map.setWarning:
      return {
        ...state,
        map: {
          ...state.map,
          warning: String(action.payload ?? '')
        }
      };

    case ACTION_TYPES.cache.setOfflineMode:
      return {
        ...state,
        cache: {
          ...state.cache,
          offlineMode: Boolean(action.payload)
        }
      };

    case ACTION_TYPES.cache.updateStats:
      return {
        ...state,
        cache: {
          ...state.cache,
          stats: {
            tileCount: Number(action.payload?.tileCount ?? state.cache.stats.tileCount),
            sizeMB: Number(action.payload?.sizeMB ?? state.cache.stats.sizeMB),
            lastUpdated: action.payload?.lastUpdated ?? state.cache.stats.lastUpdated
          }
        }
      };

    default:
      return state;
  }
}

const AppStoreStateContext = createContext(null);
const AppStoreDispatchContext = createContext(null);

export function AppStoreProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppStoreStateContext.Provider value={state}>
      <AppStoreDispatchContext.Provider value={dispatch}>{children}</AppStoreDispatchContext.Provider>
    </AppStoreStateContext.Provider>
  );
}

export function useAppStore() {
  const state = useContext(AppStoreStateContext);

  if (!state) {
    throw new Error('useAppStore debe usarse dentro de AppStoreProvider');
  }

  return state;
}

export function useAppDispatch() {
  const dispatch = useContext(AppStoreDispatchContext);

  if (!dispatch) {
    throw new Error('useAppDispatch debe usarse dentro de AppStoreProvider');
  }

  return dispatch;
}

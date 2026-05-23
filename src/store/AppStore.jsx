import { createContext, useContext, useEffect, useReducer } from 'react';
import { MAP_CONFIG } from '../map/legacyMapConfig';
import { ACTION_TYPES } from './actionTypes';

const VALID_MAP_LAYERS = new Set(['openstreetmap']);
const FAVORITES_STORAGE_KEY = 'tuRuta.favoriteRoutes';
const FAVORITE_ROUTE_CACHE_NAME = 'tunja-favorite-routes-v1';
const TILE_CACHE_NAME = 'tunja-tiles-v2';
const ROUTE_MANIFEST_URL = '/data/routes-manifest.json';

const baseInitialState = {
  ui: {
    homeOverlayCollapsed: false,
    routesSheetCollapsed: false
  },
  map: {
    currentLayer: 'openstreetmap',
    selectedRoute: null,
    coordinates: {
      lat: 5.5277,
      lng: -73.3639
    },
    warning: ''
  },
  favorites: {
    items: []
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

function readStoredFavorites() {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const storedFavorites = window.localStorage.getItem(FAVORITES_STORAGE_KEY) || '[]';
    const parsedFavorites = JSON.parse(storedFavorites);

    return Array.isArray(parsedFavorites)
      ? parsedFavorites.map(normalizeFavoriteRoute).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function buildTripFavoriteTitle(origin, destination) {
  const originLabel =
    origin?.label || `${Number(origin?.lat ?? 0).toFixed(5)}, ${Number(origin?.lng ?? 0).toFixed(5)}`;
  const destinationLabel =
    destination?.label || `${Number(destination?.lat ?? 0).toFixed(5)}, ${Number(destination?.lng ?? 0).toFixed(5)}`;

  return `${originLabel} - ${destinationLabel}`;
}

function normalizeFavoriteRoute(route) {
  if (!route || !route.id) {
    return null;
  }

  if (route.type === 'trip') {
    const baseRoute = route.route ?? {};

    return {
      id: route.id,
      type: 'trip',
      title: route.title ?? buildTripFavoriteTitle(route.origin, route.destination),
      summary: route.summary ?? baseRoute.title ?? baseRoute.summary ?? '',
      detail: route.detail ?? '',
      eta: route.eta ?? baseRoute.eta ?? 'Variable',
      route: baseRoute,
      origin: route.origin ?? null,
      destination: route.destination ?? null,
      direction: route.direction ?? '',
      endDispatchPointName: route.endDispatchPointName ?? null,
      originMatch: route.originMatch ?? null,
      destinationMatch: route.destinationMatch ?? null,
      score: route.score ?? null,
      savedAt: route.savedAt ?? new Date().toISOString()
    };
  }

  return {
    id: route.id,
    code: route.code ?? route.id,
    title: route.title ?? route.id,
    summary: route.summary ?? '',
    detail: route.detail ?? '',
    eta: route.eta ?? 'Variable',
    files: route.files ?? {},
    source_files: route.source_files ?? {}
  };
}

function createInitialState() {
  return {
    ...baseInitialState,
    favorites: {
      items: readStoredFavorites()
    }
  };
}

function latLngToTileXY(lat, lng, zoom) {
  const scale = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * scale);
  const latRadians = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRadians) + 1 / Math.cos(latRadians)) / Math.PI) / 2) * scale
  );

  return { x, y, z: zoom };
}

function buildTunjaTileUrls() {
  const [centerLat, centerLng] = MAP_CONFIG.center;
  const template = MAP_CONFIG.layers.openstreetmap.url;
  const zoomLevels = [12, 13, 14, 15, 16];
  const offsets = [-2, -1, 0, 1, 2];
  const urls = new Set();

  zoomLevels.forEach((zoom) => {
    const centerTile = latLngToTileXY(centerLat, centerLng, zoom);

    offsets.forEach((deltaX) => {
      offsets.forEach((deltaY) => {
        const x = centerTile.x + deltaX;
        const y = centerTile.y + deltaY;
        urls.add(
          template
            .replace('{z}', String(zoom))
            .replace('{x}', String(x))
            .replace('{y}', String(y))
            .replace('{s}', 'a')
        );
      });
    });
  });

  return [...urls];
}

async function cacheFavoriteRouteAssets(favoriteRoutes) {
  if (import.meta.env.DEV) {
    return;
  }

  if (typeof caches === 'undefined') {
    return;
  }

  const cache = await caches.open(FAVORITE_ROUTE_CACHE_NAME);
  const urlsToCache = new Set([ROUTE_MANIFEST_URL]);

  favoriteRoutes.forEach((route) => {
    const files = route?.type === 'trip' ? route?.route?.files ?? {} : route?.files ?? {};

    Object.values(files).forEach((filePath) => {
      if (typeof filePath === 'string' && filePath) {
        urlsToCache.add(filePath);
      }
    });
  });

  await Promise.all(
    [...urlsToCache].map(async (assetUrl) => {
      try {
        const response = await fetch(assetUrl, { cache: 'no-store' });

        if (response.ok) {
          await cache.put(assetUrl, response.clone());
        }
      } catch {
        // Se tolera fallo puntual; el cache se reintenta en el siguiente cambio de favoritos.
      }
    })
  );
}

async function warmTunjaTileCache() {
  if (import.meta.env.DEV) {
    return;
  }

  if (typeof caches === 'undefined') {
    return;
  }

  const cache = await caches.open(TILE_CACHE_NAME);
  const tileUrls = buildTunjaTileUrls();

  await Promise.all(
    tileUrls.map(async (tileUrl) => {
      try {
        const response = await fetch(tileUrl, { cache: 'no-store', mode: 'no-cors' });

        if (response.ok || response.type === 'opaque') {
          await cache.put(tileUrl, response.clone());
        }
      } catch {
        // Si un tile falla ahora, se reintentará cuando el mapa vuelva a mostrarse con internet.
      }
    })
  );
}

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

    case ACTION_TYPES.map.setSelectedRoute:
      return {
        ...state,
        map: {
          ...state.map,
          selectedRoute: action.payload ?? null
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

    case ACTION_TYPES.favorites.toggleFavorite: {
      const favoriteRoute = normalizeFavoriteRoute(action.payload);

      if (!favoriteRoute) {
        return state;
      }

      const isAlreadyFavorite = state.favorites.items.some((route) => route.id === favoriteRoute.id);

      return {
        ...state,
        favorites: {
          ...state.favorites,
          items: isAlreadyFavorite
            ? state.favorites.items.filter((route) => route.id !== favoriteRoute.id)
            : [...state.favorites.items, favoriteRoute]
        }
      };
    }

    case ACTION_TYPES.favorites.toggleFavoriteTripRoute: {
      const tripRoute = action.payload;

      if (!tripRoute || !tripRoute.route || !tripRoute.route.id) {
        return state;
      }

      const tripId =
        tripRoute.id ||
        `trip_${tripRoute.route.id}_${Number(tripRoute.origin?.lat ?? 0).toFixed(5)}_${Number(
          tripRoute.origin?.lng ?? 0
        ).toFixed(5)}_${Number(tripRoute.destination?.lat ?? 0).toFixed(5)}_${Number(
          tripRoute.destination?.lng ?? 0
        ).toFixed(5)}`;
      const favoriteTripRoute = {
        id: tripId,
        type: 'trip',
        title: tripRoute.title ?? buildTripFavoriteTitle(tripRoute.origin, tripRoute.destination),
        summary: tripRoute.summary ?? tripRoute.route.title ?? tripRoute.route.summary ?? '',
        detail: tripRoute.detail ?? '',
        eta: tripRoute.eta ?? tripRoute.route.eta ?? 'Variable',
        route: tripRoute.route,
        origin: tripRoute.origin,
        destination: tripRoute.destination,
        direction: tripRoute.direction,
        originMatch: tripRoute.originMatch,
        destinationMatch: tripRoute.destinationMatch,
        score: tripRoute.score,
        savedAt: new Date().toISOString()
      };

      const isAlreadyFavorite = state.favorites.items.some((item) => item.id === tripId);

      return {
        ...state,
        favorites: {
          ...state.favorites,
          items: isAlreadyFavorite
            ? state.favorites.items.filter((item) => item.id !== tripId)
            : [...state.favorites.items, favoriteTripRoute]
        }
      };
    }

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

const appStoreGlobalKey = '__tunjaAppStoreContext__';
const appStoreRegistry = globalThis[appStoreGlobalKey] ?? {
  stateContext: createContext(null),
  dispatchContext: createContext(null)
};

globalThis[appStoreGlobalKey] = appStoreRegistry;

const AppStoreStateContext = appStoreRegistry.stateContext;
const AppStoreDispatchContext = appStoreRegistry.dispatchContext;

export function AppStoreProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, undefined, createInitialState);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(state.favorites.items));
  }, [state.favorites.items]);

  useEffect(() => {
    if (!state.favorites.items.length) {
      return;
    }

    if (import.meta.env.DEV) {
      return;
    }

    void cacheFavoriteRouteAssets(state.favorites.items);
    void warmTunjaTileCache();
  }, [state.favorites.items]);

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

import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import TunjaLocationSearchField from '../components/TunjaLocationSearchField';
import { useAppDispatch, useAppStore } from '../store/AppStore';
import { favoritesActions, mapActions, uiActions } from '../store/actions';
import {
  selectFavoriteRoutes,
  selectRoutesSheetCollapsed
} from '../store/selectors';
import { useAuth } from '../context/AuthContext';
import {
  formatDistanceMeters,
  isInsideTunjaBounds,
  recommendTunjaBusRoute,
  resolveTunjaLocation,
  searchTunjaLocationSuggestions
} from '../map/tunjaRouting';
import { setRouteRating, getRouteRatingSummary, getRouteRatingSummaries, subscribeToRouteRatingSummaries } from '../firebase/firestoreService';
const ROUTES_MANIFEST_CACHE_KEY = 'tuRuta.routesManifest';
const ROUTE_MANIFEST_URL = '/data/routes-manifest.json';
const ROUTE_DIRECTION_CONFIG = [
  {
    key: 'outbound_route',
    title: 'Línea verde',
    label: 'Línea verde',
    color: '#15803d',
    softColor: '#dcfce7'
  },
  {
    key: 'inbound_route',
    title: 'Línea naranja',
    label: 'Línea naranja',
    color: '#ea580c',
    softColor: '#ffedd5'
  }
];

const RATING_STORAGE_KEY_PREFIX = 'tuRuta.ratings';
function getRatingsStorageKey(userId) {
  return userId ? `${RATING_STORAGE_KEY_PREFIX}.${userId}` : `${RATING_STORAGE_KEY_PREFIX}.anonymous`;
}

const geoJsonCache = new Map();

function readCachedRoutesManifest() {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const rawManifest = window.localStorage.getItem(ROUTES_MANIFEST_CACHE_KEY) || '';
    const parsedManifest = rawManifest ? JSON.parse(rawManifest) : null;
    return Array.isArray(parsedManifest?.routes) ? parsedManifest.routes : [];
  } catch {
    return [];
  }
}

async function loadGeoJson(filePath) {
  if (!geoJsonCache.has(filePath)) {
    geoJsonCache.set(
      filePath,
      fetch(filePath, { cache: 'no-store' }).then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        return response.json();
      })
    );
  }

  return geoJsonCache.get(filePath);
}

function getFeatureCoordinates(feature) {
  const geometry = feature?.geometry;

  if (!geometry) {
    return [];
  }

  if (geometry.type === 'LineString') {
    return Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
  }

  if (geometry.type === 'MultiLineString') {
    return Array.isArray(geometry.coordinates) ? geometry.coordinates.flat() : [];
  }

  if (geometry.type === 'Point') {
    return Array.isArray(geometry.coordinates) ? [geometry.coordinates] : [];
  }

  if (geometry.type === 'MultiPoint') {
    return Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
  }

  return [];
}

function getFeatureName(feature, index, fallbackLabel) {
  const rawName =
    feature?.properties?.Name ||
    feature?.properties?.name ||
    feature?.properties?.nombre ||
    '';

  if (rawName.trim()) {
    return rawName.trim();
  }

  return `${fallbackLabel} ${index + 1}`;
}

function getClosestPointName(points, targetCoordinate, fallbackLabel) {
  if (!Array.isArray(points) || points.length === 0 || !Array.isArray(targetCoordinate)) {
    return fallbackLabel;
  }

  let closestPoint = points[0];
  let closestDistance = Number.POSITIVE_INFINITY;

  points.forEach((point) => {
    const coordinates = getFeatureCoordinates(point);
    const firstCoordinate = coordinates[0];

    if (!Array.isArray(firstCoordinate)) {
      return;
    }

    const deltaLng = firstCoordinate[0] - targetCoordinate[0];
    const deltaLat = firstCoordinate[1] - targetCoordinate[1];
    const distance = deltaLng * deltaLng + deltaLat * deltaLat;

    if (distance < closestDistance) {
      closestDistance = distance;
      closestPoint = point;
    }
  });

  return getFeatureName(closestPoint, 0, fallbackLabel);
}

function buildRouteDirectionSummary(routeFilePath, dispatchFilePath, config) {
  return Promise.all([loadGeoJson(routeFilePath), loadGeoJson(dispatchFilePath)]).then(
    ([routeGeoJson, dispatchGeoJson]) => {
      const routeFeatures = Array.isArray(routeGeoJson?.features)
        ? routeGeoJson.features.filter((feature) => {
            const geometryType = feature?.geometry?.type;
            return geometryType === 'LineString' || geometryType === 'MultiLineString';
          })
        : [];

      const dispatchFeatures = Array.isArray(dispatchGeoJson?.features)
        ? dispatchGeoJson.features.filter((feature) => {
            const geometryType = feature?.geometry?.type;
            return geometryType === 'Point' || geometryType === 'MultiPoint';
          })
        : [];

      const firstRouteCoordinates = routeFeatures[0] ? getFeatureCoordinates(routeFeatures[0]) : [];
      const lastRouteCoordinates =
        routeFeatures.length > 0 ? getFeatureCoordinates(routeFeatures[routeFeatures.length - 1]) : [];

      const startCoordinate = firstRouteCoordinates[0] ?? null;
      const endCoordinate = lastRouteCoordinates[lastRouteCoordinates.length - 1] ?? null;

      const steps = [];

      const dispatchName = getClosestPointName(dispatchFeatures, startCoordinate, 'Despacho inicial');
      steps.push({
        kind: 'dispatch',
        label: 'Despacho',
        name: dispatchName
      });

      routeFeatures.forEach((feature, index) => {
        steps.push({
          kind: 'segment',
          label: `Punto de interés ${index + 1}`,
          name: getFeatureName(feature, index, 'Punto de interés')
        });
      });

      const returnName = getClosestPointName(dispatchFeatures, endCoordinate, 'Punto final');
      steps.push({
        kind: 'return',
        label: 'Punto final',
        name: returnName
      });

      return {
        ...config,
        routeFilePath,
        dispatchFilePath,
        steps,
        summary: steps.map((step) => step.name).join(' → ')
      };
    }
  );
}

function parseLatLngInput(rawValue) {
  const cleanValue = String(rawValue ?? '').trim();
  if (!cleanValue) {
    return null;
  }

  const parts = cleanValue.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) {
    return null;
  }

  return {
    lat: parts[0],
    lng: parts[1],
    label: cleanValue
  };
}

function pointToLabel(point, fallbackLabel) {
  if (!point) {
    return fallbackLabel;
  }

  return point.label || `${Number(point.lat).toFixed(5)}, ${Number(point.lng).toFixed(5)}`;
}

function getPrimaryDispatchPointName(direction, dispatchPointName, endDispatchPointName) {
  if (direction === 'inbound_route') {
    return endDispatchPointName ?? dispatchPointName ?? null;
  }

  return dispatchPointName ?? endDispatchPointName ?? null;
}

function buildDirectionRouteView(route, direction, dispatchPointName, endDispatchPointName) {
  const routeFilePath = route?.files?.[direction];

  if (!route?.files || !routeFilePath) {
    return route;
  }

  const primaryDispatchPointName = getPrimaryDispatchPointName(direction, dispatchPointName, endDispatchPointName);

  return {
    ...route,
    dispatchPointName: primaryDispatchPointName,
    endDispatchPointName: endDispatchPointName ?? null,
    files: {
      dispatch_points: route.files.dispatch_points,
      [direction]: routeFilePath
    }
  };
}

function buildSearchRecommendation(recommendation) {
  return {
    ...recommendation,
    routeView: buildDirectionRouteView(
      recommendation.route,
      recommendation.direction,
      recommendation.dispatchPointName,
      recommendation.endDispatchPointName
    )
  };
}

function normalizeApiRoute(route, index) {
  if (!route || typeof route !== 'object') {
    return null;
  }

  const routeId = String(route.id ?? route.code ?? `api-route-${index + 1}`);
  const routeCode = String(route.code ?? routeId);
  const routeTitle = String(route.title ?? route.name ?? routeCode);

  const routeGeoJSON =
    route.routeGeoJSON ??
    route.route_geojson ??
    route.geojson ??
    route.route_geometry ??
    null;

  const stops =
    route.stops ??
    route.dispatchPoints ??
    route.dispatch_points ??
    route.paradas ??
    null;

  return {
    ...route,
    id: routeId,
    code: routeCode,
    title: routeTitle,
    summary: String(route.summary ?? 'Ruta retornada por la API.'),
    detail: String(route.detail ?? 'Resultado de busqueda origen/destino.'),
    eta: String(route.eta ?? 'Variable'),
    routeGeoJSON,
    stops
  };
}

function normalizeDestinationOption(option, index) {
  if (typeof option === 'string') {
    const parsed = parseLatLngInput(option);
    return {
      id: `destination-option-${index + 1}`,
      label: option,
      coordinates: parsed
    };
  }

  if (!option || typeof option !== 'object') {
    return null;
  }

  const lat = Number(option.lat ?? option.latitude);
  const lng = Number(option.lng ?? option.longitude ?? option.lon);
  const label = String(option.label ?? option.name ?? option.destination ?? `Opcion ${index + 1}`);

  return {
    id: String(option.id ?? `destination-option-${index + 1}`),
    label,
    coordinates:
      Number.isFinite(lat) && Number.isFinite(lng)
        ? {
            lat,
            lng,
            label
          }
        : parseLatLngInput(label)
  };
}

function RutasPage() {
  const state = useAppStore();
  const dispatch = useAppDispatch();
  const location = useLocation();
  const { currentUser } = useAuth();
  const isCollapsed = selectRoutesSheetCollapsed(state);
  const favoriteRoutes = selectFavoriteRoutes(state);

  const [routes, setRoutes] = useState([]);
  const [allRoutes, setAllRoutes] = useState([]);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(true);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [selectedRouteView, setSelectedRouteView] = useState(null);
  const [routeSearchInput, setRouteSearchInput] = useState('');
  const [routeDirectionSummaries, setRouteDirectionSummaries] = useState([]);
  const [statusMessage, setStatusMessage] = useState(
    'Cargando catalogo de rutas desde tus archivos GeoJSON...'
  );

  // Routing / rating state
  const [isRoutingActive, setIsRoutingActive] = useState(false);
  const [ratingModalOpen, setRatingModalOpen] = useState(false);
  const [currentRatingValue, setCurrentRatingValue] = useState(5);
  const [ratingsMap, setRatingsMap] = useState(() => {
    try {
      const raw = window.localStorage.getItem(getRatingsStorageKey(null)) || '{}';
      return JSON.parse(raw);
    } catch {
      return {};
    }
  });
  const [routeRatingSummaries, setRouteRatingSummaries] = useState({});

  const [searchOrigin, setSearchOrigin] = useState(null);
  const [searchDestination, setSearchDestination] = useState(null);
  const [searchOriginInput, setSearchOriginInput] = useState('');
  const [searchDestinationInput, setSearchDestinationInput] = useState('');
  const [searchOriginSuggestions, setSearchOriginSuggestions] = useState([]);
  const [searchDestinationSuggestions, setSearchDestinationSuggestions] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isUsingCurrentLocation, setIsUsingCurrentLocation] = useState(false);
  const [apiError, setApiError] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !currentUser?.uid) {
      return;
    }

    try {
      const raw = window.localStorage.getItem(getRatingsStorageKey(currentUser.uid));
      if (raw) {
        setRatingsMap(JSON.parse(raw));
      }
    } catch {
      // ignore malformed local storage data
    }
  }, [currentUser?.uid]);

  const routeCatalog = useMemo(() => {
    const routeMap = new Map();

    routes.forEach((route) => {
      if (route?.id) {
        routeMap.set(route.id, route);
      }
    });

    favoriteRoutes.forEach((route) => {
      if (route?.id && route.type !== 'trip' && !routeMap.has(route.id)) {
        routeMap.set(route.id, route);
      }
    });

    return [...routeMap.values()];
  }, [routes, favoriteRoutes]);

  const selectedRoute = useMemo(() => {
    const selectedSearchResult = searchResults.find((result) => result.route?.id === selectedRouteId) ?? null;

    if (selectedSearchResult) {
      return selectedSearchResult.routeView ?? selectedSearchResult.route ?? null;
    }

    return routeCatalog.find((route) => route.id === selectedRouteId) ?? null;
  }, [routeCatalog, searchResults, selectedRouteId]);

  const visibleRoutes = searchResults.length > 0 ? searchResults : routeCatalog;

  useEffect(() => {
    const routeIds = visibleRoutes
      .map((entry) => (entry.route ?? entry)?.id)
      .filter((routeId) => typeof routeId === 'string' && routeId);

    if (routeIds.length === 0) {
      return;
    }

    let cancelled = false;
    let unsubscribe = () => {};
    
    const loadAndSubscribeToRatingSummaries = async () => {
      try {
        const initialSummaries = await getRouteRatingSummaries(routeIds);
        if (!cancelled) {
          setRouteRatingSummaries(initialSummaries);
        }

        unsubscribe = subscribeToRouteRatingSummaries(routeIds, (update) => {
          if (!cancelled) {
            setRouteRatingSummaries((prev) => ({
              ...prev,
              [update.routeId]: update.summary
            }));
          }
        });
      } catch (error) {
        console.warn('No se pudo cargar el resumen de calificaciones:', error);
      }
    };

    loadAndSubscribeToRatingSummaries();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [visibleRoutes]);

  useEffect(() => {
    const routeIdFromNavigation = location.state?.selectedRouteId;
    const tripFavoriteFromNavigation = location.state?.tripFavorite ?? null;

    if ((!routeIdFromNavigation && !tripFavoriteFromNavigation) || routeCatalog.length === 0) {
      return;
    }

    const targetRouteId = routeIdFromNavigation || tripFavoriteFromNavigation?.route?.id || tripFavoriteFromNavigation?.id;
    const routeFromNavigation = routeCatalog.find((route) => route.id === targetRouteId);

    if (routeFromNavigation) {
      setSelectedRouteId(routeFromNavigation.id);
      setSelectedRouteView(null);
      setStatusMessage(`Mostrando ${routeFromNavigation.title} desde favoritos.`);

      if (tripFavoriteFromNavigation?.origin && tripFavoriteFromNavigation?.destination) {
        window.dispatchEvent(
          new CustomEvent('map:trip-updated', {
            detail: {
              origin: tripFavoriteFromNavigation.origin,
              destination: tripFavoriteFromNavigation.destination
            }
          })
        );
      }
    }
  }, [location.state, routeCatalog]);

  const favoriteRouteIds = useMemo(
    () => new Set(favoriteRoutes.map((route) => route.id)),
    [favoriteRoutes]
  );

  useEffect(() => {
    let cancelled = false;

    const loadRoutesManifest = async () => {
      setIsLoadingRoutes(true);

      try {
        const response = await fetch(ROUTE_MANIFEST_URL, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const manifest = await response.json();
        const routeList = Array.isArray(manifest?.routes) ? manifest.routes : [];

        try {
          window.localStorage.setItem(ROUTES_MANIFEST_CACHE_KEY, JSON.stringify(manifest));
        } catch {
          // Si el almacenamiento se llena, la vista puede seguir con los datos en memoria.
        }

        if (cancelled) {
          return;
        }

        setAllRoutes(routeList);
        setRoutes(routeList);
        setSelectedRouteId((currentSelected) => {
          if (currentSelected && routeList.some((route) => route.id === currentSelected)) {
            return currentSelected;
          }
          return routeList[0]?.id ?? null;
        });

        setStatusMessage(
          routeList.length > 0
            ? `Catalogo cargado: ${routeList.length} rutas disponibles.`
            : 'No se encontraron rutas en el manifest. Ejecuta npm run sync:routes.'
        );
      } catch (error) {
        if (!cancelled) {
          const cachedRoutes = readCachedRoutesManifest();
          const offlineRoutes =
            cachedRoutes.length > 0 ? cachedRoutes : favoriteRoutes.filter((route) => route?.type !== 'trip');

          setAllRoutes(offlineRoutes);
          setRoutes(offlineRoutes);
          setSelectedRouteId((currentSelected) => {
            if (currentSelected && offlineRoutes.some((route) => route.id === currentSelected)) {
              return currentSelected;
            }
            return offlineRoutes[0]?.id ?? null;
          });

          setStatusMessage(
            offlineRoutes.length > 0
              ? 'Sin conexion: se cargaron rutas guardadas localmente.'
              : `No se pudo cargar ${ROUTE_MANIFEST_URL}. Ejecuta npm run sync:routes y vuelve a compilar.`
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingRoutes(false);
        }
      }
    };

    loadRoutesManifest();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    dispatch(mapActions.setSelectedRoute(selectedRoute));
  }, [dispatch, selectedRoute]);

  useEffect(() => {
    let cancelled = false;

    const loadRouteDirections = async () => {
      if (!selectedRoute?.files) {
        setRouteDirectionSummaries([]);
        return;
      }

      const directionConfigs = ROUTE_DIRECTION_CONFIG.filter((config) => selectedRoute.files[config.key]);

      if (directionConfigs.length === 0) {
        setRouteDirectionSummaries([]);
        return;
      }

      try {
        const summaries = await Promise.all(
          directionConfigs.map((config) =>
            buildRouteDirectionSummary(
              selectedRoute.files[config.key],
              selectedRoute.files.dispatch_points,
              config
            )
          )
        );

        if (!cancelled) {
          setRouteDirectionSummaries(summaries);
        }
      } catch (error) {
        if (!cancelled) {
          setRouteDirectionSummaries([]);
          setStatusMessage(`No se pudo ordenar ${selectedRoute.title}: ${error.message}`);
        }
      }
    };

    loadRouteDirections();

    return () => {
      cancelled = true;
    };
  }, [selectedRoute]);

  const handleRouteSelect = (route, routeView = null) => {
    if (!route?.id) {
      return;
    }

    setSelectedRouteId(route.id);
    setSelectedRouteView(routeView);
    dispatch(mapActions.setSelectedRoute(routeView ?? route));
    setStatusMessage(
      routeView?.directionLabel
        ? `${route.title} (${routeView.directionLabel}) activada y visible en el mapa.`
        : `${route.title} activada y visible en el mapa.`
    );
  };

  // Ratings helpers
  const saveRatingsToStorage = (next) => {
    try {
      window.localStorage.setItem(getRatingsStorageKey(currentUser?.uid), JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const ensureRouteHasDefaultRating = (routeId) => {
    if (!routeId) return;
    setRatingsMap((prev) => {
      if (prev[routeId]) return prev;
      const next = {
        ...prev,
        [routeId]: { count: 1, total: 5, average: 5 }
      };
      saveRatingsToStorage(next);
      return next;
    });
  };

  const submitRatingForRoute = async (routeId, value) => {
    if (!routeId) return;

    if (currentUser?.uid) {
      try {
        await setRouteRating(currentUser.uid, routeId, value);
        const summary = await getRouteRatingSummary(routeId);
        const nextEntry = {
          count: summary.count,
          total: summary.total,
          average: summary.average,
          lastRating: value
        };
        const next = { ...ratingsMap, [routeId]: nextEntry };
        setRatingsMap(next);
        saveRatingsToStorage(next);
        return;
      } catch (error) {
        console.error('No se pudo guardar la calificación en Firestore:', error);
        // continuar con la lógica local si falla la persistencia remota
      }
    }

    setRatingsMap((prev) => {
      const existing = prev[routeId] ?? { count: 0, total: 0, average: 5, lastRating: null };
      const previousRating = Number(existing.lastRating ?? 0);
      const nextCount = previousRating > 0 ? Math.max(existing.count, 1) : existing.count + 1;
      const nextTotal = previousRating > 0 ? existing.total - previousRating + value : existing.total + value;
      const nextAverage = nextCount > 0 ? nextTotal / nextCount : 5;
      const nextEntry = {
        count: nextCount,
        total: nextTotal,
        average: nextAverage,
        lastRating: value
      };
      const next = { ...prev, [routeId]: nextEntry };
      saveRatingsToStorage(next);
      return next;
    });
  };

  const handleFavoriteToggle = (route) => {
    const isFavorite = favoriteRouteIds.has(route.id);

    dispatch(favoritesActions.toggleFavorite(route));
    setStatusMessage(
      isFavorite ? `${route.title} se elimino de favoritos.` : `${route.title} se guardo en favoritos.`
    );
  };

  const handleRouteSearch = () => {
    const searchText = routeSearchInput.trim().toLowerCase();

    if (!searchText) {
      setStatusMessage('Escribe el nombre o codigo de la ruta que quieres consultar.');
      return;
    }

    const matchingRoute = routeCatalog.find((route) => {
      const title = String(route.title ?? '').toLowerCase();
      const code = String(route.code ?? '').toLowerCase();

      return title.includes(searchText) || code.includes(searchText) || route.id.toLowerCase().includes(searchText);
    });

    if (!matchingRoute) {
      setStatusMessage('No encontre esa ruta en el catalogo disponible.');
      return;
    }

    setSelectedRouteId(matchingRoute.id);
    setSelectedRouteView(null);
    setStatusMessage(`Ruta encontrada: ${matchingRoute.title}. Ya se mostro en el mapa.`);
  };

  const updateSearchOriginQuery = (value) => {
    setSearchOriginInput(value);
    setSearchOrigin(null);
    setSearchOriginSuggestions(searchTunjaLocationSuggestions(value));
  };

  const updateSearchDestinationQuery = (value) => {
    setSearchDestinationInput(value);
    setSearchDestination(null);
    setSearchDestinationSuggestions(searchTunjaLocationSuggestions(value));
  };

  const selectSearchOriginSuggestion = (suggestion) => {
    if (!suggestion) {
      return;
    }

    const nextOrigin = {
      lat: suggestion.lat,
      lng: suggestion.lng,
      label: suggestion.displayName || suggestion.label,
      source: suggestion.source || 'local'
    };

    setSearchOriginInput(nextOrigin.label);
    setSearchOrigin(nextOrigin);
    setSearchOriginSuggestions([]);
  };

  const selectSearchDestinationSuggestion = (suggestion) => {
    if (!suggestion) {
      return;
    }

    const nextDestination = {
      lat: suggestion.lat,
      lng: suggestion.lng,
      label: suggestion.displayName || suggestion.label,
      source: suggestion.source || 'local'
    };

    setSearchDestinationInput(nextDestination.label);
    setSearchDestination(nextDestination);
    setSearchDestinationSuggestions([]);
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setApiError('Tu navegador no permite usar la ubicacion actual.');
      setIsUsingCurrentLocation(false);
      return;
    }

    setIsUsingCurrentLocation(true);
    setApiError(null);
    setStatusMessage('Buscando tu ubicacion actual para usarla como origen...');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const currentPoint = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          label: 'Ubicacion actual',
          source: 'current-location'
        };

        setSearchOrigin(currentPoint);
        setSearchOriginInput(currentPoint.label);
        setSearchOriginSuggestions([]);
        dispatch(mapActions.setCoordinates(currentPoint.lat, currentPoint.lng));

        window.dispatchEvent(
          new CustomEvent('map:mark-trip-points', {
            detail: {
              origin: currentPoint,
              destination: searchDestination
            }
          })
        );

        if (!isInsideTunjaBounds(currentPoint.lat, currentPoint.lng)) {
          setStatusMessage('Capturamos tu ubicacion, pero esta fuera de Tunja y su borde cercano.');
        } else {
          setStatusMessage('Ubicacion actual lista como origen. Ahora puedes buscar el destino por nombre.');
        }

        setIsUsingCurrentLocation(false);
      },
      () => {
        setApiError('No pudimos obtener tu ubicacion actual. Revisa permisos y vuelve a intentarlo.');
        setStatusMessage('No pudimos usar tu ubicacion compartida como origen.');
        setIsUsingCurrentLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  const searchRoutes = async (origin, destination) => {
    setIsSearching(true);
    setApiError(null);
    setStatusMessage('Buscando rutas disponibles por nombre...');

    try {
      const result = await recommendTunjaBusRoute(origin, destination);
      const nextRecommendations = Array.isArray(result?.recommendations)
        ? result.recommendations.map((recommendation) => buildSearchRecommendation(recommendation)).filter(Boolean)
        : [];

      setSearchResults(nextRecommendations);
      setSelectedRouteId(nextRecommendations[0]?.route?.id ?? null);
      setSelectedRouteView(nextRecommendations[0]?.routeView ?? null);
      dispatch(mapActions.setSelectedRoute(nextRecommendations[0]?.routeView ?? nextRecommendations[0]?.route ?? null));
      setStatusMessage(
        nextRecommendations.length > 0
          ? `Encontré ${nextRecommendations.length} rutas que respetan el sentido real del trayecto.`
          : 'No encontré rutas confiables para ese origen y destino.'
      );

      return nextRecommendations;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Error desconocido en búsqueda';
      setApiError(errorMsg);
      setStatusMessage(`Error buscando rutas: ${errorMsg}`);

      setSearchResults([]);
      return [];
    } finally {
      setIsSearching(false);
    }
  };

  function handleMapError(errorMsg) {
    if (
      errorMsg?.includes('appendChild') &&
      document.querySelector('.leaflet-pane .leaflet-interactive')
    ) {
      return;
    }
    setStatusMessage(errorMsg);
  }

  const handleApiSearchSubmit = async () => {
    const parsedOrigin = searchOrigin ?? (await resolveTunjaLocation(searchOriginInput));
    const parsedDestination = searchDestination ?? (await resolveTunjaLocation(searchDestinationInput));

    if (!parsedOrigin || !parsedDestination) {
      setApiError('No pude resolver uno de los sitios por nombre. Prueba con UPTC, Medilaser o Terminal.');
      return;
    }

    setSearchOrigin(parsedOrigin);
    setSearchDestination(parsedDestination);

    window.dispatchEvent(
      new CustomEvent('map:mark-trip-points', {
        detail: {
          origin: parsedOrigin,
          destination: parsedDestination
        }
      })
    );

    await searchRoutes(parsedOrigin, parsedDestination);
    // ensure default 5 stars for returned recommendations
    // we will set defaults for all returned routes
    // but do it after searchResults is updated
  };

  useEffect(() => {
    // whenever visible routes change, ensure defaults exist
    visibleRoutes.forEach((entry) => {
      const route = entry.route ?? entry;
      if (route?.id && !ratingsMap[route.id]) {
        ensureRouteHasDefaultRating(route.id);
      }
    });
  }, [visibleRoutes]);

  const handleSubmitRating = async () => {
    if (!selectedRoute?.id) return;
    await submitRatingForRoute(selectedRoute.id, Number(currentRatingValue));
    setRatingModalOpen(false);
    setIsRoutingActive(false);
    setStatusMessage(`Gracias por calificar ${selectedRoute.title} con ${currentRatingValue} estrellas.`);
  };

  const handleCancelRating = () => {
    setRatingModalOpen(false);
  };

  const handleResetApiSearch = () => {
    setSearchResults([]);
    setSearchOrigin(null);
    setSearchDestination(null);
    setSearchOriginInput('');
    setSearchDestinationInput('');
    setSearchOriginSuggestions([]);
    setSearchDestinationSuggestions([]);
    setApiError(null);
    setSelectedRouteId(allRoutes[0]?.id ?? null);
    setSelectedRouteView(null);
    dispatch(mapActions.setSelectedRoute(allRoutes[0] ?? null));
    setStatusMessage('Se restauro el catalogo completo de rutas.');

    window.dispatchEvent(
      new CustomEvent('map:mark-trip-points', {
        detail: {
          origin: null,
          destination: null
        }
      })
    );
  };

  return (
    <section className="view-panel active" data-view="rutas">
      <div className="routes-sheet-header">
        <button
          type="button"
          className="routes-sheet-toggle"
          id="toggleRoutesSheetBtn"
          aria-expanded={String(!isCollapsed)}
          aria-label={isCollapsed ? 'Expandir panel de rutas' : 'Minimizar panel de rutas'}
          onClick={() => dispatch(uiActions.toggleRoutesSheetCollapsed())}
        >
          <span className="sheet-grabber" aria-hidden="true"></span>
          <span id="routesSheetToggleLabel">{isCollapsed ? 'Mostrar panel' : 'Panel de rutas'}</span>
        </button>
      </div>

      <section className="panel">
        <h2>Que ruta deseas saber su curso</h2>
        <p className="panel-copy">Escribe el nombre o codigo de la ruta para verla directamente sobre el mapa.</p>
        <div className="input-with-action routes-search-row">
          <input
            id="routeSearchInput"
            type="text"
            placeholder="Ej: Ruta 10, Muiscas, Terminal"
            value={routeSearchInput}
            onChange={(event) => setRouteSearchInput(event.target.value)}
          />
          <button type="button" className="ghost-btn" id="findRouteBtn" onClick={handleRouteSearch}>
            Buscar ruta
          </button>
        </div>
        <div id="routeSuggestionStatus" className="note-box">
          {statusMessage}
        </div>
      </section>

      <section className="panel">
        <h2>Buscar por nombre de origen y destino</h2>
        <p className="panel-copy">Escribe lugares como UPTC, Medilaser, Terminal o una estacion de servicio.</p>
        <div className="trip-form route-name-search-form">
          <div className="route-origin-search-block">
            <TunjaLocationSearchField
              id="routeOriginSearch"
              label="Origen"
              placeholder="Estoy en la UPTC"
              value={searchOriginInput}
              suggestions={searchOriginSuggestions}
              onChange={updateSearchOriginQuery}
              onSelectSuggestion={selectSearchOriginSuggestion}
              showSuggestions={false}
              helperText="La busqueda usa primero coincidencias internas de Tunja y luego completa con el mapa si hace falta."
            />
            <button
              type="button"
              className="ghost-btn route-current-location-btn"
              onClick={handleUseCurrentLocation}
              disabled={isUsingCurrentLocation}
            >
              {isUsingCurrentLocation ? 'Tomando ubicacion...' : 'Usar ubicacion actual'}
            </button>
          </div>
          <TunjaLocationSearchField
            id="routeDestinationSearch"
            label="Destino"
            placeholder="Quiero ir a Medilaser"
            value={searchDestinationInput}
            suggestions={searchDestinationSuggestions}
            onChange={updateSearchDestinationQuery}
            onSelectSuggestion={selectSearchDestinationSuggestion}
            showSuggestions={false}
            helperText="Las rutas se filtran por sentido real para evitar coincidencias invertidas."
          />
        </div>
        <div className="input-with-action routes-search-row">
          <button type="button" className="ghost-btn" onClick={handleApiSearchSubmit} disabled={isSearching}>
            {isSearching ? 'Buscando...' : 'Buscar ruta'}
          </button>
          <button type="button" className="ghost-btn" onClick={handleResetApiSearch} disabled={isSearching}>
            Limpiar
          </button>
        </div>
        {apiError ? <p className="map-warning">{apiError}</p> : null}
        {searchOrigin && searchDestination ? (
          <p className="panel-copy">
            Ultima busqueda: {searchOrigin.label} {'->'} {searchDestination.label}
          </p>
        ) : null}
      </section>

      <section className="panel">
        <h2>{searchResults.length > 0 ? 'Rutas ordenadas por cercania y sentido' : 'Rutas disponibles'}</h2>
        {searchResults.length > 0 ? (
          <p className="panel-copy">Mostrando las rutas mas cercanas al origen y destino, en el sentido correcto de la linea.</p>
        ) : null}
        <ul className="route-list">
          {visibleRoutes.map((entry) => {
            const route = entry.route ?? entry;
            const routeView = entry.routeView ?? null;
            const routeId = route?.id;
            const isSearchResult = Boolean(routeView);
            const isSelected = selectedRouteId === routeId;
            const ratingForRoute = routeRatingSummaries[routeId] ?? ratingsMap[routeId] ?? { average: 5, count: 1 };

            return (
              <li key={routeId}>
                <div className={`route-card ${isSelected ? 'is-selected' : ''} ${isSearchResult ? 'route-card-recommended' : ''}`}>
                  <button
                    type="button"
                    className="route-card-main"
                    onClick={() => handleRouteSelect(route, routeView)}
                  >
                    <strong>
                      {route.title}
                      <span className="route-rating">{' '}• {Number(ratingForRoute.average).toFixed(1)}★</span>
                    </strong>
                    <span>{isSearchResult ? routeView.directionLabel : route.summary}</span>
                    {isSearchResult ? (
                      <div className="route-card-direction-block">
                        <span
                          className="route-pill route-direction-pill"
                          style={{ backgroundColor: routeView.directionSoftColor, color: routeView.directionColor }}
                        >
                          {routeView.directionLabel}
                        </span>
                        <span className="route-card-distance">
                          {pointToLabel(routeView.originMatch, 'Origen')} · {formatDistanceMeters(routeView.originMatch?.distanceMeters)}
                        </span>
                        <span className="route-card-distance">
                          {pointToLabel(routeView.destinationMatch, 'Destino')} · {formatDistanceMeters(routeView.destinationMatch?.distanceMeters)}
                        </span>
                      </div>
                    ) : null}
                    <div className="route-card-meta">
                      <span className="route-pill">ETA {route.eta}</span>
                      <span className="route-pill route-pill-muted">Toca para ver la ruta</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={`route-favorite-btn ${favoriteRouteIds.has(routeId) ? 'is-favorite' : ''}`}
                    aria-pressed={favoriteRouteIds.has(routeId)}
                    aria-label={
                      favoriteRouteIds.has(routeId)
                        ? `Quitar ${route.title} de favoritos`
                        : `Guardar ${route.title} en favoritos`
                    }
                    onClick={() => handleFavoriteToggle(route)}
                  >
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <path d="M12 21s-7.2-4.6-9.4-9.1C1 8.5 2.8 5.5 6.1 4.8c2-.4 3.9.4 5.1 1.8 1.2-1.4 3.1-2.2 5.1-1.8C19.6 5.5 21.4 8.5 21.4 11.9 19.2 16.4 12 21 12 21z"></path>
                    </svg>
                  </button>
                  {isSearchResult && isSelected ? (
                    <div className="route-action-row">
                      {!isRoutingActive ? (
                        <button
                          type="button"
                          className="primary-btn"
                          onClick={() => {
                            setIsRoutingActive(true);
                            setStatusMessage('Ruta iniciada. Presiona Finalizar ruta al terminar.');
                          }}
                        >
                          Iniciar ruta
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="danger-btn"
                          onClick={() => {
                            setIsRoutingActive(false);
                            setStatusMessage('Ruta finalizada. Por favor califica tu experiencia.');
                            setRatingModalOpen(true);
                            setCurrentRatingValue(5);
                          }}
                        >
                          Finalizar ruta
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        {!isLoadingRoutes && visibleRoutes.length === 0 ? (
          <div className="route-detail">
            <h3>Sin rutas publicadas</h3>
            <p>Ejecuta npm run sync:routes para generar public/data/routes-manifest.json.</p>
          </div>
        ) : null}
        {selectedRoute ? (
          <div className="route-detail">
            <h3>{selectedRoute.title}</h3>
            <p>{selectedRoute.detail}</p>
            {selectedRoute.routeGeoJSON ? <p className="panel-copy">Linea GeoJSON cargada desde API.</p> : null}
            {selectedRoute.stops ? <p className="panel-copy">Paradas/despachos disponibles para mostrar en mapa.</p> : null}
            <div className="route-color-legend route-color-legend-compact">
              <span className="route-legend-item">
                <span className="route-legend-swatch route-legend-green"></span>
                Linea verde
              </span>
              <span className="route-legend-item">
                <span className="route-legend-swatch route-legend-orange"></span>
                Linea naranja
              </span>
              <span className="route-legend-note">Verde y naranja indican las dos lineas publicadas de la ruta.</span>
            </div>
            {routeDirectionSummaries.length > 0 ? (
              <div className="route-direction-summary">
                {routeDirectionSummaries.map((direction) => (
                  <article key={direction.key} className="route-direction-card">
                    <div className="route-direction-header">
                      <span
                        className="route-direction-chip"
                        style={{ backgroundColor: direction.softColor, color: direction.color }}
                      >
                        {direction.title}
                      </span>
                      <div>
                        <strong>{direction.label}</strong>
                        <p>{direction.summary}</p>
                      </div>
                    </div>
                    <ol className="route-sequence-list">
                      {direction.steps.map((step, index) => (
                        <li key={`${direction.key}-${step.kind}-${index}`} className="route-sequence-item">
                          <span className="route-sequence-index">{index + 1}</span>
                          <div>
                            <strong>{step.label}</strong>
                            <span>{step.name}</span>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
      {ratingModalOpen ? (
        <div className="rating-modal-backdrop">
          <div className="rating-modal" role="dialog" aria-modal="true">
            <h3>Califica la ruta recomendada</h3>
            <p>Selecciona entre 1 y 5 estrellas para valorar la ruta.</p>
            <div className="rating-stars">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className={`star-btn ${currentRatingValue >= star ? 'selected' : ''}`}
                  onClick={() => setCurrentRatingValue(star)}
                  aria-label={`${star} estrellas`}
                >
                  {currentRatingValue >= star ? '★' : '☆'}
                </button>
              ))}
            </div>
            <div className="rating-actions">
              <button type="button" className="primary-btn" onClick={handleSubmitRating}>
                Enviar calificación
              </button>
              <button type="button" className="ghost-btn" onClick={handleCancelRating}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default RutasPage;

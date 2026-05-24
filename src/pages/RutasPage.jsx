import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppDispatch, useAppStore } from '../store/AppStore';
import { favoritesActions, mapActions, uiActions } from '../store/actions';
import {
  selectFavoriteRoutes,
  selectRoutesSheetCollapsed
} from '../store/selectors';

const FINALIZED_ROUTE_KEY = 'tuRuta.finalizedRoute';
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

function RutasPage() {
  const state = useAppStore();
  const dispatch = useAppDispatch();
  const location = useLocation();
  const isCollapsed = selectRoutesSheetCollapsed(state);
  const favoriteRoutes = selectFavoriteRoutes(state);

  const [routes, setRoutes] = useState([]);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(true);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [routeSearchInput, setRouteSearchInput] = useState('');
  const [routeDirectionSummaries, setRouteDirectionSummaries] = useState([]);
  const [statusMessage, setStatusMessage] = useState(
    'Cargando catalogo de rutas desde tus archivos GeoJSON...'
  );

  // Estados para búsqueda por origen/destino (API-ready)
  const [searchOrigin, setSearchOrigin] = useState(null);
  const [searchDestination, setSearchDestination] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [apiError, setApiError] = useState(null);

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

  const selectedRoute = useMemo(
    () => routeCatalog.find((route) => route.id === selectedRouteId) ?? null,
    [routeCatalog, selectedRouteId]
  );

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

  const handleRouteSelect = (route) => {
    setSelectedRouteId(route.id);
    setStatusMessage(`${route.title} activada y visible en el mapa.`);
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
    setStatusMessage(`Ruta encontrada: ${matchingRoute.title}. Ya se mostro en el mapa.`);
  };

  // Búsqueda de rutas por origen/destino (API-ready para Fase 2)
  const searchRoutes = async (origin, destination) => {
    // Validar entrada
    if (!origin || !destination) {
      setApiError('Debe especificar origen y destino');
      return [];
    }

    setIsSearching(true);
    setApiError(null);
    setStatusMessage('Buscando rutas disponibles...');

    try {
      // Llamada real a backend para buscar rutas por origen y destino
      const response = await fetch(`/api/search?origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&radius=5000`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setSearchResults(data.routes || []);
      return data.routes || [];
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

  // Callback robusto para errores del mapa
  function handleMapError(errorMsg) {
    // Si es el error de appendChild pero la ruta ya está visible, ignóralo
    if (
      errorMsg?.includes('appendChild') &&
      document.querySelector('.leaflet-pane .leaflet-interactive') // hay capa visible
    ) {
      return;
    }
    setStatusMessage(errorMsg);
  }

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
        <h2>Rutas disponibles</h2>
        <ul className="route-list">
          {routeCatalog.map((route) => (
            <li key={route.id}>
              <div className={`route-card ${selectedRouteId === route.id ? 'is-selected' : ''}`}>
                <button
                  type="button"
                  className="route-card-main"
                  onClick={() => handleRouteSelect(route)}
                >
                  <strong>{route.title}</strong>
                  <span>{route.summary}</span>
                  <div className="route-card-meta">
                    <span className="route-pill">ETA {route.eta}</span>
                    <span className="route-pill route-pill-muted">Toca para ver la ruta</span>
                  </div>
                </button>

                <button
                  type="button"
                  className={`route-favorite-btn ${favoriteRouteIds.has(route.id) ? 'is-favorite' : ''}`}
                  aria-pressed={favoriteRouteIds.has(route.id)}
                  aria-label={
                    favoriteRouteIds.has(route.id)
                      ? `Quitar ${route.title} de favoritos`
                      : `Guardar ${route.title} en favoritos`
                  }
                  onClick={() => handleFavoriteToggle(route)}
                >
                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <path d="M12 21s-7.2-4.6-9.4-9.1C1 8.5 2.8 5.5 6.1 4.8c2-.4 3.9.4 5.1 1.8 1.2-1.4 3.1-2.2 5.1-1.8C19.6 5.5 21.4 8.5 21.4 11.9 19.2 16.4 12 21 12 21z"></path>
                  </svg>
                </button>
              </div>
            </li>
          ))}
        </ul>
        {!isLoadingRoutes && routeCatalog.length === 0 ? (
          <div className="route-detail">
            <h3>Sin rutas publicadas</h3>
            <p>Ejecuta npm run sync:routes para generar public/data/routes-manifest.json.</p>
          </div>
        ) : null}
        {selectedRoute ? (
          <div className="route-detail">
            <h3>{selectedRoute.title}</h3>
            <p>{selectedRoute.detail}</p>
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
    </section>
  );
}

export default RutasPage;

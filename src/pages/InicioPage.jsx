import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAppDispatch, useAppStore } from '../store/AppStore';
import { mapActions, favoritesActions } from '../store/actions';
import { selectFavoriteTripRoutes } from '../store/selectors';
import {
  formatDistanceMeters,
  isInsideTunjaBounds,
  recommendTunjaBusRoute,
  resolveTunjaLocation
} from '../map/tunjaRouting';
import {
  consumeDeviceLocationReactivated,
  formatDeviceLocation,
  isDeviceLocationEnabled
} from '../utils/deviceLocation';

function pointToLabel(point, fallbackLabel) {
  if (!point) {
    return fallbackLabel;
  }

  return point.label || `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
}

function buildTripFavoriteKey(routeId, origin, destination) {
  const originKey = `${Number(origin?.lat ?? 0).toFixed(5)}_${Number(origin?.lng ?? 0).toFixed(5)}`;
  const destinationKey = `${Number(destination?.lat ?? 0).toFixed(5)}_${Number(destination?.lng ?? 0).toFixed(5)}`;

  return `trip_${routeId}_${originKey}_${destinationKey}`;
}

function buildTripFavoriteTitle(origin, destination) {
  return `${pointToLabel(origin, 'Origen')} - ${pointToLabel(destination, 'Destino')}`;
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

function isSamePoint(pointA, pointB) {
  if (!pointA || !pointB) {
    return false;
  }

  return (
    Number(pointA.lat).toFixed(5) === Number(pointB.lat).toFixed(5) &&
    Number(pointA.lng).toFixed(5) === Number(pointB.lng).toFixed(5)
  );
}

function InicioPage() {
  const location = useLocation();
  const { userProfile } = useAuth();
  const state = useAppStore();
  const dispatch = useAppDispatch();
  const favoriteTripRoutes = selectFavoriteTripRoutes(state);

  const [originInput, setOriginInput] = useState('');
  const [destinationInput, setDestinationInput] = useState('');
  const [selectedOrigin, setSelectedOrigin] = useState(null);
  const [selectedDestination, setSelectedDestination] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    'Escribe el sitio de origen y destino dentro de Tunja. Luego busca la mejor ruta de bus.'
  );
  const [recommendations, setRecommendations] = useState([]);
  const activeView = location.pathname.split('/').filter(Boolean)[0] || 'inicio';
  const savedDeviceLocation = userProfile?.currentLocation ?? null;

  const savedDeviceLocationSummary = useMemo(() => {
    if (!savedDeviceLocation) {
      return null;
    }

    return {
      label: formatDeviceLocation(savedDeviceLocation),
      coordinates: savedDeviceLocation.coordinatesLabel || `${Number(savedDeviceLocation.latitude).toFixed(6)}, ${Number(savedDeviceLocation.longitude).toFixed(6)}`
    };
  }, [savedDeviceLocation]);

  const focusMapOnCoordinates = (lat, lng, zoom = 17) => {
    window.dispatchEvent(
      new CustomEvent('map:focus-selected-location', {
        detail: { lat, lng, zoom }
      })
    );
  };

  useEffect(() => {
    if (activeView !== 'inicio' || !isDeviceLocationEnabled() || !savedDeviceLocationSummary) {
      return;
    }

    const autoCenterCoordinates = {
      lat: savedDeviceLocation.latitude,
      lng: savedDeviceLocation.longitude
    };

    focusMapOnCoordinates(autoCenterCoordinates.lat, autoCenterCoordinates.lng, 17);
  }, [activeView, savedDeviceLocation, savedDeviceLocationSummary]);

  useEffect(() => {
    const tripFavorite = location.state?.tripFavorite ?? null;

    if (!tripFavorite?.route?.id) {
      return;
    }

    const restoredOrigin = tripFavorite.origin ?? null;
    const restoredDestination = tripFavorite.destination ?? null;

    setOriginInput(restoredOrigin?.label ?? '');
    setDestinationInput(restoredDestination?.label ?? '');
    setSelectedOrigin(restoredOrigin);
    setSelectedDestination(restoredDestination);
    setRecommendations([
      {
        route: tripFavorite.route,
        routeView: buildDirectionRouteView(
          tripFavorite.route,
          tripFavorite.direction,
          tripFavorite.dispatchPointName,
          tripFavorite.endDispatchPointName
        ),
        direction: tripFavorite.direction ?? '',
        directionLabel: tripFavorite.directionLabel ?? (tripFavorite.direction === 'inbound_route' ? 'Linea naranja' : 'Linea verde'),
        directionColor: tripFavorite.directionColor ?? (tripFavorite.direction === 'inbound_route' ? '#ea580c' : '#15803d'),
        directionSoftColor:
          tripFavorite.directionSoftColor ?? (tripFavorite.direction === 'inbound_route' ? '#ffedd5' : '#dcfce7'),
        dispatchPointName: tripFavorite.dispatchPointName ?? null,
        endDispatchPointName: tripFavorite.endDispatchPointName ?? null,
        originMatch: tripFavorite.originMatch ?? { distanceMeters: 0, label: restoredOrigin?.label ?? 'Origen' },
        destinationMatch:
          tripFavorite.destinationMatch ?? { distanceMeters: 0, label: restoredDestination?.label ?? 'Destino' },
        score: tripFavorite.score ?? 0
      }
    ]);
    setStatusMessage(`Mostrando ${tripFavorite.route.title} guardada desde favoritos.`);
    dispatch(
      mapActions.setSelectedRoute(
        buildDirectionRouteView(
          tripFavorite.route,
          tripFavorite.direction,
          tripFavorite.dispatchPointName,
          tripFavorite.endDispatchPointName
        )
      )
    );

    window.dispatchEvent(
      new CustomEvent('map:trip-updated', {
        detail: {
          origin: restoredOrigin,
          destination: restoredDestination
        }
      })
    );
  }, [dispatch, location.state]);

  useEffect(() => {
    const shouldForceCenter = consumeDeviceLocationReactivated();

    if (
      !isDeviceLocationEnabled() ||
      !savedDeviceLocationSummary ||
      (!shouldForceCenter && (selectedOrigin || originInput.trim()))
    ) {
      return;
    }

    const autoOrigin = {
      lat: savedDeviceLocation.latitude,
      lng: savedDeviceLocation.longitude,
      label: savedDeviceLocationSummary.label,
      source: 'saved-device-location'
    };

    setSelectedOrigin(autoOrigin);
    setOriginInput(autoOrigin.label);
    dispatch(mapActions.setCoordinates(autoOrigin.lat, autoOrigin.lng));
    focusMapOnCoordinates(autoOrigin.lat, autoOrigin.lng, 17);
    setStatusMessage('Se uso tu ubicacion guardada como origen inicial.');
  }, [dispatch, originInput, savedDeviceLocation, savedDeviceLocationSummary, selectedOrigin]);

  const resolvePoint = async (role, query) => {
    const trimmedQuery = String(query ?? '').trim();
    if (!trimmedQuery) {
      return null;
    }

    const resolvedLocation = await resolveTunjaLocation(trimmedQuery);
    if (!resolvedLocation) {
      throw new Error(
        `No pude ubicar ${role === 'origin' ? 'el origen' : 'el destino'} dentro de Tunja. Intenta con un sitio de Tunja.`
      );
    }

    return resolvedLocation;
  };

  const handleResetTrip = () => {
    setSelectedOrigin(null);
    setSelectedDestination(null);
    setOriginInput('');
    setDestinationInput('');
    setRecommendations([]);
    setStatusMessage('Los puntos fueron borrados. Escribe un nuevo origen y destino.');
    dispatch(mapActions.setSelectedRoute(null));

    window.dispatchEvent(
      new CustomEvent('map:trip-updated', {
        detail: {
          origin: null,
          destination: null
        }
      })
    );
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setStatusMessage('Tu navegador no permite usar la ubicacion actual.');
      return;
    }

    setStatusMessage('Buscando tu ubicacion actual...');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const currentPoint = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          label: 'Ubicacion actual',
          source: 'current-location'
        };

        setSelectedOrigin(currentPoint);
        setOriginInput(currentPoint.label);
        dispatch(mapActions.setCoordinates(currentPoint.lat, currentPoint.lng));
        focusMapOnCoordinates(currentPoint.lat, currentPoint.lng, 17);
        setStatusMessage('Ubicacion actual lista como origen y centrada en el mapa.');
      },
      () => {
        setStatusMessage('No pude obtener tu ubicacion actual. Revisa permisos y vuelve a intentarlo.');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  const handleSearchRoutes = async () => {
    if (isCalculating) {
      return;
    }

    setIsCalculating(true);
    setRecommendations([]);
    setSelectedDestination(null);
    setSelectedOrigin((currentOrigin) =>
      currentOrigin?.source === 'current-location' ? currentOrigin : null
    );
    dispatch(mapActions.setSelectedRoute(null));

    window.dispatchEvent(
      new CustomEvent('map:trip-updated', {
        detail: {
          origin: null,
          destination: null
        }
      })
    );

    try {
      const origin =
        selectedOrigin?.source === 'current-location'
          ? selectedOrigin
          : await resolvePoint('origin', originInput);
      const destination = await resolvePoint('destination', destinationInput);

      if (!origin || !destination) {
        setStatusMessage('Necesito un origen y un destino dentro de Tunja para sugerirte una ruta.');
        return;
      }

      if (!isInsideTunjaBounds(origin.lat, origin.lng) || !isInsideTunjaBounds(destination.lat, destination.lng)) {
        setStatusMessage('Solo se aceptan puntos dentro de Tunja y su periferia cercana.');
        return;
      }

      const result = await recommendTunjaBusRoute(origin, destination);

      if (!result?.recommendations || result.recommendations.length === 0) {
        setRecommendations([]);
        setStatusMessage('No pude calcular rutas de bus confiables para ese trayecto dentro de Tunja.');
        return;
      }

      setSelectedOrigin({
        lat: origin.lat,
        lng: origin.lng,
        label: origin.label || origin.displayName || 'Origen',
        source: origin.source || 'search'
      });

      setSelectedDestination({
        lat: destination.lat,
        lng: destination.lng,
        label: destination.label || destination.displayName || 'Destino',
        source: destination.source || 'search'
      });

      if (result.recommendations.length > 0) {
        const nextRecommendations = result.recommendations.map((recommendation) => ({
          ...recommendation,
          routeView: buildDirectionRouteView(
            recommendation.route,
            recommendation.direction,
            recommendation.dispatchPointName,
            recommendation.endDispatchPointName
          )
        }));

        setRecommendations(nextRecommendations);
        dispatch(mapActions.setSelectedRoute(nextRecommendations[0].routeView));
        setStatusMessage(`Se encontraron ${result.recommendations.length} rutas disponibles.`);

        window.dispatchEvent(
          new CustomEvent('map:mark-trip-points', {
            detail: {
              origin: { lat: origin.lat, lng: origin.lng, label: origin.label },
              destination: { lat: destination.lat, lng: destination.lng, label: destination.label }
            }
          })
        );
      }
    } catch (error) {
      setRecommendations([]);
      setStatusMessage(error?.message || 'No pude calcular la ruta solicitada.');
    } finally {
      setIsCalculating(false);
    }
  };

  const handleToggleFavoriteTripRoute = (recommendation) => {
    const tripId = buildTripFavoriteKey(recommendation.route.id, selectedOrigin, selectedDestination);
    const routeView =
      recommendation.routeView ??
      buildDirectionRouteView(
        recommendation.route,
        recommendation.direction,
        recommendation.dispatchPointName,
        recommendation.endDispatchPointName
      );

    dispatch(
      favoritesActions.toggleFavoriteTripRoute({
        id: tripId,
        title: buildTripFavoriteTitle(selectedOrigin, selectedDestination),
        summary: recommendation.route.summary ?? recommendation.route.title ?? '',
        detail: `Ruta ${recommendation.route.title}`,
        eta: recommendation.route.eta ?? 'Variable',
        route: routeView,
        origin: selectedOrigin,
        destination: selectedDestination,
        direction: recommendation.direction,
        dispatchPointName: recommendation.dispatchPointName,
        endDispatchPointName: recommendation.endDispatchPointName ?? null,
        directionLabel: recommendation.directionLabel,
        directionColor: recommendation.directionColor,
        directionSoftColor: recommendation.directionSoftColor,
        originMatch: recommendation.originMatch,
        destinationMatch: recommendation.destinationMatch,
        score: recommendation.score
      })
    );
  };

  const isTripRouteFavorite = (recommendation) => {
    const tripId = buildTripFavoriteKey(recommendation.route.id, selectedOrigin, selectedDestination);

    return favoriteTripRoutes.some(
      (fav) =>
        fav.id === tripId ||
        (fav.route?.id === recommendation.route?.id &&
          isSamePoint(fav.origin, selectedOrigin) &&
          isSamePoint(fav.destination, selectedDestination))
    );
  };

  return (
    <section className="view-panel active" data-view="inicio">
      <section className="panel">
        <h2>Donde estas y a donde quieres ir</h2>
        <p className="panel-copy">
          Escribe el sitio de origen y destino dentro de Tunja para encontrar la mejor ruta de bus.
        </p>
        <form className="trip-form" onSubmit={(event) => event.preventDefault()}>
          <label htmlFor="originInput">Donde estas</label>
          <input
            id="originInput"
            type="text"
            placeholder="Ej: Plaza de Bolivar, Tunja"
            value={originInput}
            onChange={(event) => {
              setOriginInput(event.target.value);
              setSelectedOrigin(null);
            }}
          />

          <label htmlFor="destinationInput">A donde quieres ir</label>
          <input
            id="destinationInput"
            type="text"
            placeholder="Ej: Universidad Pedagogica y Tecnologica de Colombia"
            value={destinationInput}
            onChange={(event) => {
              setDestinationInput(event.target.value);
              setSelectedDestination(null);
            }}
          />

          <button type="button" className="primary-btn" id="findRoutesBtn" onClick={handleSearchRoutes}>
            {isCalculating ? 'Calculando...' : 'Buscar mejor ruta de bus'}
          </button>

          <button type="button" className="ghost-btn" id="useCurrentLocationBtn" onClick={handleUseCurrentLocation}>
            Usar ubicacion actual
          </button>

          <button type="button" className="ghost-btn" id="resetTripBtn" onClick={handleResetTrip}>
            Limpiar puntos
          </button>
        </form>

        <div className="note-box routes-search-note">{statusMessage}</div>
      </section>

      <section className="panel">
        <h2>Puntos elegidos</h2>
        <div className="trip-location-list">
          <div className="trip-location-card">
            <span>Origen</span>
            <strong>{pointToLabel(selectedOrigin, 'Aun no seleccionado')}</strong>
          </div>
          <div className="trip-location-card">
            <span>Destino</span>
            <strong>{pointToLabel(selectedDestination, 'Aun no seleccionado')}</strong>
          </div>
        </div>
        <div className="trip-location-card saved-location-card">
          <span>Tu ubicacion guardada</span>
          <strong>{savedDeviceLocationSummary?.label || 'Aun no has guardado una ubicacion en tu perfil'}</strong>
          <em>{savedDeviceLocationSummary?.coordinates || 'Se mostrara aqui cuando la captures desde el login o el perfil.'}</em>
        </div>
        <p className="trip-tip">
          El mapa solo acepta ubicaciones dentro de Tunja y su borde cercano.
        </p>
      </section>

      {recommendations.length > 0 && (
        <section className="panel">
          <h2>Rutas disponibles ({recommendations.length})</h2>
          <div className="route-color-legend">
            <span className="route-legend-item">
              <span className="route-legend-swatch route-legend-green"></span>
              Linea verde
            </span>
            <span className="route-legend-item">
              <span className="route-legend-swatch route-legend-orange"></span>
              Linea naranja
            </span>
            <span className="route-legend-note">Solo se muestra el sentido que mejor le sirve al viaje.</span>
          </div>
          <div className="routes-list">
            {recommendations.map((recommendation, index) => (
              <div key={`${recommendation.route.id}_${index}`} className="route-recommendation-card">
                <div className="route-header">
                  <div className="route-info">
                    <h3>{recommendation.route.title}</h3>
                    <p>{recommendation.route.summary}</p>
                    <div className="route-sense-chip" style={{ backgroundColor: recommendation.directionSoftColor, color: recommendation.directionColor }}>
                      Sentido útil: {recommendation.directionLabel}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`route-favorite-btn ${isTripRouteFavorite(recommendation) ? 'is-favorite' : ''}`}
                    aria-pressed={isTripRouteFavorite(recommendation)}
                    onClick={() => handleToggleFavoriteTripRoute(recommendation)}
                    title={
                      isTripRouteFavorite(recommendation)
                        ? 'Quitar de favoritos'
                        : 'Guardar en favoritos'
                    }
                  >
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <path d="M12 21s-7.2-4.6-9.4-9.1C1 8.5 2.8 5.5 6.1 4.8c2-.4 3.9.4 5.1 1.8 1.2-1.4 3.1-2.2 5.1-1.8C19.6 5.5 21.4 8.5 21.4 11.9 19.2 16.4 12 21 12 21z"></path>
                    </svg>
                  </button>
                </div>
                <div className="route-details">
                  <div className="route-detail-item">
                    <span className="label">Origen: Caminar</span>
                    <strong>{formatDistanceMeters(recommendation.originMatch.distanceMeters)}</strong>
                  </div>
                  <div className="route-detail-item">
                    <span className="label">Destino: Caminar</span>
                    <strong>{formatDistanceMeters(recommendation.destinationMatch.distanceMeters)}</strong>
                  </div>
                  <div className="route-detail-item">
                    <span className="label">Puntuación</span>
                    <strong>{formatDistanceMeters(recommendation.score)}</strong>
                  </div>
                </div>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => dispatch(mapActions.setSelectedRoute(recommendation.routeView ?? recommendation.route))}
                >
                  Ver ruta en mapa
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

export default InicioPage;

import { useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppStore } from '../store/AppStore';
import { mapActions, uiActions } from '../store/actions';
import { selectCoordinates, selectRoutesSheetCollapsed } from '../store/selectors';

const FINALIZED_ROUTE_KEY = 'tuRuta.finalizedRoute';
const ROUTE_MANIFEST_URL = '/data/routes-manifest.json';

function RutasPage() {
  const state = useAppStore();
  const dispatch = useAppDispatch();
  const isCollapsed = selectRoutesSheetCollapsed(state);
  const currentCoordinates = selectCoordinates(state);

  const [routes, setRoutes] = useState([]);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(true);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [originInput, setOriginInput] = useState('');
  const [destinationInput, setDestinationInput] = useState('');
  const [statusMessage, setStatusMessage] = useState(
    'Cargando catalogo de rutas desde tus archivos GeoJSON...'
  );

  const selectedRoute = useMemo(
    () => routes.find((route) => route.id === selectedRouteId) ?? null,
    [routes, selectedRouteId]
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
          setRoutes([]);
          setSelectedRouteId(null);
          setStatusMessage(
            `No se pudo cargar ${ROUTE_MANIFEST_URL}. Ejecuta npm run sync:routes y vuelve a compilar.`
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
    if (!originInput) {
      setOriginInput(`${currentCoordinates.lat.toFixed(5)}, ${currentCoordinates.lng.toFixed(5)}`);
    }
  }, [currentCoordinates.lat, currentCoordinates.lng, originInput]);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setStatusMessage('Tu navegador no permite usar la ubicacion del dispositivo.');
      return;
    }

    setStatusMessage('Solicitando acceso a la ubicacion del dispositivo...');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;

        dispatch(mapActions.setCoordinates(latitude, longitude));
        window.dispatchEvent(
          new CustomEvent('map:focus-selected-location', {
            detail: { lat: latitude, lng: longitude, zoom: 16 }
          })
        );

        setOriginInput(`Mi ubicacion actual (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`);
        setStatusMessage('Ubicacion actual cargada y marcada en el mapa.');
      },
      (error) => {
        setStatusMessage(error?.message || 'No se pudo obtener la ubicacion del dispositivo.');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000
      }
    );
  };

  const handleRouteSelect = (route) => {
    setSelectedRouteId(route.id);
    setStatusMessage(`${route.title} activada y visible en el mapa.`);
  };

  const handleSearchRoutes = () => {
    if (!originInput.trim() || !destinationInput.trim()) {
      setStatusMessage('Completa origen y destino para simular la busqueda de rutas.');
      return;
    }

    if (!selectedRoute) {
      setStatusMessage('Selecciona una ruta disponible para verla sobre el mapa.');
      return;
    }

    setStatusMessage(`Busqueda preparada para ${selectedRoute.title}.`);
  };

  const handleFinalizeRoute = () => {
    if (!selectedRoute) {
      setStatusMessage('Selecciona una ruta antes de finalizarla.');
      return;
    }

    const payload = {
      id: selectedRoute.id,
      title: selectedRoute.title,
      summary: selectedRoute.summary,
      finalizedAt: new Date().toISOString()
    };

    window.localStorage.setItem(FINALIZED_ROUTE_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent('tuRuta:routeFinalized', { detail: payload }));
    setStatusMessage(`Ruta finalizada: ${selectedRoute.title}. Ya puedes calificarla.`);
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
        <form className="trip-form" onSubmit={(event) => event.preventDefault()}>
          <label htmlFor="originInput">Donde estas</label>
          <div className="input-with-action">
            <input
              id="originInput"
              type="text"
              placeholder="Ej: Plaza de Bolivar, Tunja"
              value={originInput}
              onChange={(event) => setOriginInput(event.target.value)}
            />
            <button type="button" className="ghost-btn" id="useCurrentLocationBtn" onClick={handleUseCurrentLocation}>
              Usar mi ubicacion
            </button>
          </div>

          <label htmlFor="destinationInput">A donde quieres ir</label>
          <input
            id="destinationInput"
            type="text"
            placeholder="Ej: Universidad Pedagogica y Tecnologica de Colombia"
            value={destinationInput}
            onChange={(event) => setDestinationInput(event.target.value)}
          />

          <button type="button" className="primary-btn" id="findRoutesBtn" onClick={handleSearchRoutes}>
            Buscar rutas de buses
          </button>
        </form>
        <div id="routeSuggestionStatus" className="note-box">
          {statusMessage}
        </div>
      </section>

      <section className="panel">
        <h2>Rutas disponibles</h2>
        <ul className="route-list">
          {routes.map((route) => (
            <li key={route.id}>
              <button
                type="button"
                className={`route-card ${selectedRouteId === route.id ? 'is-selected' : ''}`}
                onClick={() => handleRouteSelect(route)}
              >
                <strong>{route.title}</strong>
                <span>{route.summary}</span>
                <div className="route-card-meta">
                  <span className="route-pill">ETA {route.eta}</span>
                  <span className="route-pill route-pill-muted">Toca para ver la ruta</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
        {!isLoadingRoutes && routes.length === 0 ? (
          <div className="route-detail">
            <h3>Sin rutas publicadas</h3>
            <p>Ejecuta npm run sync:routes para generar public/data/routes-manifest.json.</p>
          </div>
        ) : null}
        {selectedRoute ? (
          <div className="route-detail">
            <h3>{selectedRoute.title}</h3>
            <p>{selectedRoute.detail}</p>
            <button type="button" className="primary-btn" onClick={handleFinalizeRoute}>
              Finalizar ruta
            </button>
          </div>
        ) : null}
      </section>
    </section>
  );
}

export default RutasPage;

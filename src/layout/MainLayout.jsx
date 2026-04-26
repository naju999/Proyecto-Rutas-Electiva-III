import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import MapCanvas from '../map/MapCanvas';
import {
  activateServiceWorkerUpdate,
  subscribeServiceWorkerUpdates
} from '../pwa/registerServiceWorker';
import { useAppDispatch, useAppStore } from '../store/AppStore';
import { cacheActions, mapActions as mapStoreActions, uiActions } from '../store/actions';
import { clearTileCache, getTileCacheStats, trimTileCache } from '../pwa/tileCacheController';
import {
  selectCacheOfflineMode,
  selectCacheStats,
  selectCoordinates,
  selectCurrentLayer,
  selectHomeOverlayCollapsed,
  selectMapWarning,
  selectRoutesSheetCollapsed,
  selectShowBusA1
} from '../store/selectors';

const NAV_ITEMS = [
  {
    to: '/inicio',
    label: 'Inicio',
    icon: (
      <svg viewBox="0 0 24 24" className="nav-icon-svg" focusable="false" aria-hidden="true">
        <path d="M3 10.5L12 3l9 7.5"></path>
        <path d="M5.5 9.5V20h13V9.5"></path>
      </svg>
    )
  },
  {
    to: '/rutas',
    label: 'Rutas',
    icon: (
      <svg viewBox="0 0 24 24" className="nav-icon-svg" focusable="false" aria-hidden="true">
        <circle cx="5" cy="6" r="2"></circle>
        <circle cx="19" cy="12" r="2"></circle>
        <circle cx="5" cy="18" r="2"></circle>
        <path d="M7 6h6a3 3 0 0 1 3 3"></path>
        <path d="M17 13a3 3 0 0 1-3 3H7"></path>
      </svg>
    )
  },
  {
    to: '/favoritos',
    label: 'Favoritos',
    icon: (
      <svg viewBox="0 0 24 24" className="nav-icon-svg" focusable="false" aria-hidden="true">
        <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"></path>
      </svg>
    )
  },
  {
    to: '/perfil',
    label: 'Perfil',
    icon: (
      <svg viewBox="0 0 24 24" className="nav-icon-svg" focusable="false" aria-hidden="true">
        <circle cx="12" cy="8" r="4"></circle>
        <path d="M5 20a7 7 0 0 1 14 0"></path>
      </svg>
    )
  }
];

function MainLayout() {
  const location = useLocation();
  const state = useAppStore();
  const dispatch = useAppDispatch();

  const [mapActions, setMapActions] = useState(null);
  const [isCacheBusy, setIsCacheBusy] = useState(false);
  const [isApplyingSwUpdate, setIsApplyingSwUpdate] = useState(false);
  const [isSwUpdateAvailable, setIsSwUpdateAvailable] = useState(false);

  const isHomeOverlayCollapsed = selectHomeOverlayCollapsed(state);
  const isRoutesSheetCollapsed = selectRoutesSheetCollapsed(state);
  const currentLayer = selectCurrentLayer(state);
  const showBusA1 = selectShowBusA1(state);
  const coord = selectCoordinates(state);
  const mapWarning = selectMapWarning(state);
  const isOfflineMode = selectCacheOfflineMode(state);
  const cacheStats = selectCacheStats(state);

  const tileCount = Number(cacheStats?.tileCount ?? 0);
  const cacheSizeMB = Number(cacheStats?.sizeMB ?? 0).toFixed(2);

  const activeView = useMemo(() => {
    const segment = location.pathname.split('/').filter(Boolean)[0];
    return segment || 'inicio';
  }, [location.pathname]);

  const isMapView = activeView === 'inicio' || activeView === 'rutas';

  const currentLayerLabel = useMemo(() => {
    if (currentLayer === 'satellite') return 'Satelite';
    if (currentLayer === 'terrain') return 'Terreno';
    return 'OpenStreetMap';
  }, [currentLayer]);

  useEffect(() => {
    document.body.setAttribute('data-active-view', activeView);
    return () => {
      document.body.removeAttribute('data-active-view');
      document.body.classList.remove('routes-sheet-collapsed');
    };
  }, [activeView]);

  useEffect(() => {
    const shouldCollapseRoutesSheet = activeView === 'rutas' && isRoutesSheetCollapsed;

    document.body.classList.toggle('routes-sheet-collapsed', shouldCollapseRoutesSheet);
    window.dispatchEvent(
      new CustomEvent('routes-sheet:toggle', {
        detail: {
          collapsed: shouldCollapseRoutesSheet
        }
      })
    );
  }, [activeView, isRoutesSheetCollapsed]);

  useEffect(() => {
    if (!mapActions || !isMapView) return;
    mapActions.invalidateSize();
  }, [activeView, isMapView, mapActions]);

  useEffect(() => {
    if (!mapActions || !isMapView) return undefined;

    const handleRoutesSheetToggle = () => {
      mapActions.invalidateSize();
      window.setTimeout(() => {
        mapActions.invalidateSize();
      }, 240);
    };

    window.addEventListener('routes-sheet:toggle', handleRoutesSheetToggle);
    return () => {
      window.removeEventListener('routes-sheet:toggle', handleRoutesSheetToggle);
    };
  }, [isMapView, mapActions]);

  useEffect(() => {
    const syncOfflineMode = () => {
      dispatch(cacheActions.setOfflineMode(!navigator.onLine));
    };

    syncOfflineMode();
    window.addEventListener('online', syncOfflineMode);
    window.addEventListener('offline', syncOfflineMode);

    return () => {
      window.removeEventListener('online', syncOfflineMode);
      window.removeEventListener('offline', syncOfflineMode);
    };
  }, [dispatch]);

  useEffect(() => {
    let isMounted = true;

    const refreshTileStats = async () => {
      const stats = await getTileCacheStats();
      if (!stats || !isMounted) return;

      dispatch(
        cacheActions.updateStats({
          tileCount: Number(stats.tileCount ?? 0),
          sizeMB: Number(stats.sizeMB ?? 0),
          lastUpdated: stats.lastUpdated ?? Date.now()
        })
      );
    };

    const handleControllerChange = () => {
      void refreshTileStats();
    };

    void refreshTileStats();
    const intervalId = window.setInterval(() => {
      void refreshTileStats();
    }, 30000);

    window.addEventListener('pwa:sw-controller-change', handleControllerChange);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener('pwa:sw-controller-change', handleControllerChange);
    };
  }, [dispatch]);

  useEffect(() => {
    return subscribeServiceWorkerUpdates((stateUpdate) => {
      setIsSwUpdateAvailable(Boolean(stateUpdate?.available));

      if (!stateUpdate?.available) {
        setIsApplyingSwUpdate(false);
      }
    });
  }, []);

  const handleHomeOverlayToggle = () => {
    dispatch(uiActions.toggleHomeOverlayCollapsed());

    if (!mapActions || !isMapView) return;
    mapActions.invalidateSize();
    window.setTimeout(() => {
      mapActions.invalidateSize();
    }, 180);
  };

  const handleTrimTileCache = async () => {
    if (isCacheBusy) return;

    setIsCacheBusy(true);
    try {
      const stats = await trimTileCache();
      if (!stats) return;

      dispatch(
        cacheActions.updateStats({
          tileCount: Number(stats.tileCount ?? 0),
          sizeMB: Number(stats.sizeMB ?? 0),
          lastUpdated: stats.lastUpdated ?? Date.now()
        })
      );
    } finally {
      setIsCacheBusy(false);
    }
  };

  const handleClearTileCache = async () => {
    if (isCacheBusy) return;

    setIsCacheBusy(true);
    try {
      const stats = await clearTileCache();

      dispatch(
        cacheActions.updateStats({
          tileCount: Number(stats?.tileCount ?? 0),
          sizeMB: Number(stats?.sizeMB ?? 0),
          lastUpdated: stats?.lastUpdated ?? Date.now()
        })
      );
    } finally {
      setIsCacheBusy(false);
    }
  };

  const handleApplySwUpdate = async () => {
    if (isApplyingSwUpdate) return;

    setIsApplyingSwUpdate(true);
    const started = await activateServiceWorkerUpdate();

    if (!started) {
      setIsApplyingSwUpdate(false);
    }
  };

  return (
    <>
      <header id="header">
        <div className="brand-block">
          <p className="eyebrow">Movilidad urbana inteligente</p>
          <h1>Rutas de Buses de Tunja</h1>
        </div>
      </header>

      {isSwUpdateAvailable ? (
        <section className="sw-update-banner" aria-live="polite">
          <p>Nueva version disponible. Actualiza para evitar inconsistencias de cache.</p>
          <button type="button" onClick={handleApplySwUpdate} disabled={isApplyingSwUpdate}>
            {isApplyingSwUpdate ? 'Actualizando...' : 'Actualizar app'}
          </button>
        </section>
      ) : null}

      <main id="container">
        <section id="mapWorkspace" className={`map-column ${isMapView ? '' : 'is-hidden'}`}>
          <div
            className={`map-tools map-tools-home ${isHomeOverlayCollapsed ? 'is-collapsed' : ''}`}
            id="homeMapOverlay"
          >
            <div className="home-overlay-header">
              <span className="home-overlay-title">Info rapida</span>
              <button
                type="button"
                id="toggleHomeOverlayBtn"
                className="overlay-toggle-btn"
                aria-expanded={String(!isHomeOverlayCollapsed)}
                aria-controls="homeMapOverlayContent"
                aria-label={
                  isHomeOverlayCollapsed
                    ? 'Expandir panel de informacion'
                    : 'Minimizar panel de informacion'
                }
                onClick={handleHomeOverlayToggle}
              >
                {isHomeOverlayCollapsed ? '+' : '-'}
              </button>
            </div>

            <div className="home-map-info" id="homeMapOverlayContent">
              <div className="home-tip-pane">
                <div className="note-box home-map-note">
                  Tip: usa clic derecho sobre el mapa para capturar coordenadas y preparar una
                  consulta.
                </div>
              </div>

              <div className="home-coord-pane">
                <p className="coord-title">Coordenadas actuales</p>
                <div className="coordinates home-map-coords">
                  <div>
                    <span>Latitud</span>
                    <strong id="coordLat">{coord.lat.toFixed(6)}</strong>
                  </div>
                  <div>
                    <span>Longitud</span>
                    <strong id="coordLng">{coord.lng.toFixed(6)}</strong>
                  </div>
                </div>
                <div className="cache-status-inline" aria-live="polite">
                  <span>{isOfflineMode ? 'Sin conexion' : 'En linea'}</span>
                  <span>Tiles: {tileCount}</span>
                  <span>Cache: {cacheSizeMB} MB</span>
                </div>
                <div className="cache-actions">
                  <button
                    type="button"
                    className="ghost-btn cache-control-btn"
                    onClick={handleTrimTileCache}
                    disabled={isCacheBusy}
                  >
                    Optimizar cache
                  </button>
                  <button
                    type="button"
                    className="ghost-btn cache-control-btn"
                    onClick={handleClearTileCache}
                    disabled={isCacheBusy}
                  >
                    Limpiar tiles
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="map-tools map-tools-routes" aria-label="Controles del mapa">
            <div className="button-group">
              <button
                type="button"
                onClick={() => {
                  if (mapActions) mapActions.centerMap();
                }}
              >
                Centrar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (mapActions) mapActions.zoomIn();
                }}
              >
                Zoom +
              </button>
              <button
                type="button"
                onClick={() => {
                  if (mapActions) mapActions.zoomOut();
                }}
              >
                Zoom -
              </button>
              <button
                type="button"
                onClick={() => {
                  if (mapActions) mapActions.resetView();
                }}
              >
                Reset
              </button>
            </div>

            <div className="layer-controls">
              <p>Capa actual: {currentLayerLabel}</p>
              <label>
                <input
                  type="radio"
                  name="layer"
                  value="openstreetmap"
                  checked={currentLayer === 'openstreetmap'}
                  onChange={(event) => dispatch(mapStoreActions.setCurrentLayer(event.target.value))}
                />
                OpenStreetMap
              </label>
              <label>
                <input
                  type="radio"
                  name="layer"
                  value="satellite"
                  checked={currentLayer === 'satellite'}
                  onChange={(event) => dispatch(mapStoreActions.setCurrentLayer(event.target.value))}
                />
                Satelite
              </label>
              <label>
                <input
                  type="radio"
                  name="layer"
                  value="terrain"
                  checked={currentLayer === 'terrain'}
                  onChange={(event) => dispatch(mapStoreActions.setCurrentLayer(event.target.value))}
                />
                Terreno
              </label>

              <label className="route-toggle">
                <input
                  type="checkbox"
                  checked={showBusA1}
                  onChange={(event) => dispatch(mapStoreActions.setShowBusA1(event.target.checked))}
                />
                Mostrar ruta A1
              </label>
            </div>

            <div className="cache-status-inline cache-status-routes" aria-live="polite">
              <span>{isOfflineMode ? 'Sin conexion' : 'En linea'}</span>
              <span>Tiles: {tileCount}</span>
              <span>Cache: {cacheSizeMB} MB</span>
            </div>

            <div className="cache-actions routes-cache-actions">
              <button
                type="button"
                className="ghost-btn cache-control-btn"
                onClick={handleTrimTileCache}
                disabled={isCacheBusy}
              >
                Optimizar cache
              </button>
              <button
                type="button"
                className="ghost-btn cache-control-btn"
                onClick={handleClearTileCache}
                disabled={isCacheBusy}
              >
                Limpiar tiles
              </button>
            </div>

            {mapWarning ? <p className="map-warning">{mapWarning}</p> : null}
          </div>

          <MapCanvas
            currentLayer={currentLayer}
            showBusA1={showBusA1}
            onMapReady={setMapActions}
            onMapError={(warning) => dispatch(mapStoreActions.setWarning(warning))}
            onCoordinatesChange={(lat, lng) => dispatch(mapStoreActions.setCoordinates(lat, lng))}
          />
        </section>

        <aside id="sidebar">
          <Outlet />
        </aside>
      </main>

      <nav className="bottom-nav" aria-label="Navegacion principal">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
          >
            <span className="nav-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}

export default MainLayout;

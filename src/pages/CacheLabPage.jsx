import { useEffect, useMemo, useState } from 'react';
import MapCanvas from '../map/MapCanvas';
import { clearTileCache, getTileCacheStats, trimTileCache } from '../pwa/tileCacheController';
import './CacheLabPage.css';

function CacheLabPage() {
  const [showBusA1, setShowBusA1] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(!navigator.onLine);
  const [isCacheBusy, setIsCacheBusy] = useState(false);
  const [mapWarning, setMapWarning] = useState('');
  const [coord, setCoord] = useState({
    lat: 5.5277,
    lng: -73.3639
  });
  const [cacheStats, setCacheStats] = useState({
    tileCount: 0,
    sizeMB: 0,
    lastUpdated: null
  });

  const tileCount = Number(cacheStats.tileCount ?? 0);
  const cacheSizeMB = Number(cacheStats.sizeMB ?? 0).toFixed(2);

  const lastUpdatedLabel = useMemo(() => {
    if (!cacheStats.lastUpdated) return 'Sin datos';

    try {
      return new Date(cacheStats.lastUpdated).toLocaleTimeString('es-CO', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return 'Sin datos';
    }
  }, [cacheStats.lastUpdated]);

  useEffect(() => {
    document.body.classList.add('cache-lab-mode');
    return () => {
      document.body.classList.remove('cache-lab-mode');
    };
  }, []);

  useEffect(() => {
    const syncOfflineMode = () => {
      setIsOfflineMode(!navigator.onLine);
    };

    window.addEventListener('online', syncOfflineMode);
    window.addEventListener('offline', syncOfflineMode);

    return () => {
      window.removeEventListener('online', syncOfflineMode);
      window.removeEventListener('offline', syncOfflineMode);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const refreshTileStats = async () => {
      const stats = await getTileCacheStats();
      if (!isMounted || !stats) return;

      setCacheStats({
        tileCount: Number(stats.tileCount ?? 0),
        sizeMB: Number(stats.sizeMB ?? 0),
        lastUpdated: stats.lastUpdated ?? Date.now()
      });
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
  }, []);

  const handleTrimTileCache = async () => {
    if (isCacheBusy) return;

    setIsCacheBusy(true);
    try {
      const stats = await trimTileCache();
      if (!stats) return;

      setCacheStats({
        tileCount: Number(stats.tileCount ?? 0),
        sizeMB: Number(stats.sizeMB ?? 0),
        lastUpdated: stats.lastUpdated ?? Date.now()
      });
    } finally {
      setIsCacheBusy(false);
    }
  };

  const handleClearTileCache = async () => {
    if (isCacheBusy) return;

    setIsCacheBusy(true);
    try {
      const stats = await clearTileCache();
      setCacheStats({
        tileCount: Number(stats?.tileCount ?? 0),
        sizeMB: Number(stats?.sizeMB ?? 0),
        lastUpdated: stats?.lastUpdated ?? Date.now()
      });
    } finally {
      setIsCacheBusy(false);
    }
  };

  const handleRefreshStats = async () => {
    if (isCacheBusy) return;

    setIsCacheBusy(true);
    try {
      const stats = await getTileCacheStats();
      if (!stats) return;

      setCacheStats({
        tileCount: Number(stats.tileCount ?? 0),
        sizeMB: Number(stats.sizeMB ?? 0),
        lastUpdated: stats.lastUpdated ?? Date.now()
      });
    } finally {
      setIsCacheBusy(false);
    }
  };

  return (
    <section className="cache-lab-page" aria-label="Laboratorio de cache y ruta A1">
      <header className="cache-lab-header">
        <p className="cache-lab-kicker">Laboratorio aislado</p>
        <h1>Pruebas de cache y ruta A1</h1>
        <p className="cache-lab-subtitle">
          Esta vista es independiente del layout principal y sirve para validar cache de tiles sin
          afectar el flujo normal de la aplicacion.
        </p>
      </header>

      <div className="cache-lab-toolbar" aria-live="polite">
        <div className="cache-lab-badges">
          <span>{isOfflineMode ? 'Sin conexion' : 'En linea'}</span>
          <span>Tiles: {tileCount}</span>
          <span>Cache: {cacheSizeMB} MB</span>
          <span>Actualizado: {lastUpdatedLabel}</span>
        </div>

        <div className="cache-lab-actions">
          <button type="button" className="cache-lab-btn" onClick={handleRefreshStats} disabled={isCacheBusy}>
            Actualizar metricas
          </button>
          <button type="button" className="cache-lab-btn" onClick={handleTrimTileCache} disabled={isCacheBusy}>
            Optimizar cache
          </button>
          <button type="button" className="cache-lab-btn" onClick={handleClearTileCache} disabled={isCacheBusy}>
            Limpiar tiles
          </button>
          <button
            type="button"
            className={`cache-lab-btn ${showBusA1 ? 'is-active' : ''}`}
            onClick={() => setShowBusA1((prev) => !prev)}
          >
            {showBusA1 ? 'Ocultar ruta A1' : 'Mostrar ruta A1'}
          </button>
        </div>
      </div>

      {mapWarning ? <p className="cache-lab-warning">{mapWarning}</p> : null}

      <div className="cache-lab-map-wrap">
        <MapCanvas
          currentLayer="openstreetmap"
          showBusA1={showBusA1}
          onMapReady={() => {}}
          onMapError={(warning) => setMapWarning(warning)}
          onCoordinatesChange={(lat, lng) => setCoord({ lat, lng })}
        />
      </div>

      <footer className="cache-lab-footer">
        <div>
          <span>Latitud</span>
          <strong>{coord.lat.toFixed(6)}</strong>
        </div>
        <div>
          <span>Longitud</span>
          <strong>{coord.lng.toFixed(6)}</strong>
        </div>
        <p>
          Nota: en modo desarrollo, el Service Worker puede estar desactivado; en ese caso los
          comandos de cache no devolveran metricas.
        </p>
      </footer>
    </section>
  );
}

export default CacheLabPage;

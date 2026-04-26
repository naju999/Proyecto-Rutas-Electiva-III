import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MAP_CONFIG } from './legacyMapConfig';
import {
  addMarkersAndFeatures,
  changeMapLayer,
  createBusRouteLayer,
  initializeBaseLayers
} from './legacyMapAdapter';

function MapCanvas({
  currentLayer,
  showBusA1,
  onMapReady,
  onMapError,
  onCoordinatesChange
}) {
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const baseLayersRef = useRef({});
  const routeLayerRef = useRef(null);
  const activeLayerRef = useRef('openstreetmap');
  const showBusA1Ref = useRef(showBusA1);
  const onMapReadyRef = useRef(onMapReady);
  const onMapErrorRef = useRef(onMapError);
  const onCoordinatesChangeRef = useRef(onCoordinatesChange);

  useEffect(() => {
    onMapReadyRef.current = onMapReady;
  }, [onMapReady]);

  useEffect(() => {
    onMapErrorRef.current = onMapError;
  }, [onMapError]);

  useEffect(() => {
    onCoordinatesChangeRef.current = onCoordinatesChange;
  }, [onCoordinatesChange]);

  useEffect(() => {
    showBusA1Ref.current = showBusA1;
  }, [showBusA1]);

  useEffect(() => {
    if (!mapNodeRef.current || mapRef.current) {
      return undefined;
    }

    let isDisposed = false;

    const map = L.map(mapNodeRef.current, {
      zoomControl: true,
      minZoom: MAP_CONFIG.minZoom,
      maxZoom: MAP_CONFIG.maxZoom
    }).setView(MAP_CONFIG.center, MAP_CONFIG.initialZoom);

    mapRef.current = map;
    map.zoomControl.setPosition('topright');
    L.control.scale().addTo(map);

    const baseLayers = initializeBaseLayers(L);
    baseLayersRef.current = baseLayers;
    activeLayerRef.current = 'openstreetmap';
    baseLayers.openstreetmap.addTo(map);

    addMarkersAndFeatures(L, map);

    map.on('contextmenu', (event) => {
      onCoordinatesChangeRef.current(event.latlng.lat, event.latlng.lng);
    });

    const center = map.getCenter();
    onCoordinatesChangeRef.current(center.lat, center.lng);

    const handleWindowResize = () => {
      if (!isDisposed) {
        map.invalidateSize(false);
      }
    };

    window.addEventListener('resize', handleWindowResize);

    const resizeObserver = new ResizeObserver(() => {
      if (!isDisposed) {
        map.invalidateSize(false);
      }
    });
    resizeObserver.observe(mapNodeRef.current);

    createBusRouteLayer(L, map)
      .then((routeLayer) => {
        if (isDisposed) {
          return;
        }

        routeLayerRef.current = routeLayer;
        if (!showBusA1Ref.current && map.hasLayer(routeLayer)) {
          map.removeLayer(routeLayer);
        }
      })
      .catch((error) => {
        if (!isDisposed) {
          onMapErrorRef.current(`No se pudo cargar la ruta A1: ${error.message}`);
        }
      });

    onMapReadyRef.current({
      centerMap: () => map.flyTo(MAP_CONFIG.center, MAP_CONFIG.initialZoom),
      zoomIn: () => map.zoomIn(),
      zoomOut: () => map.zoomOut(),
      resetView: () => map.setView(MAP_CONFIG.center, MAP_CONFIG.initialZoom),
      invalidateSize: () => map.invalidateSize(false)
    });

    return () => {
      isDisposed = true;
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleWindowResize);
      onMapReadyRef.current(null);
      map.remove();
      mapRef.current = null;
      routeLayerRef.current = null;
      baseLayersRef.current = {};
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    activeLayerRef.current = changeMapLayer(
      map,
      baseLayersRef.current,
      currentLayer,
      activeLayerRef.current
    );
  }, [currentLayer]);

  useEffect(() => {
    const map = mapRef.current;
    const busLayer = routeLayerRef.current;
    if (!map || !busLayer) return;

    if (showBusA1 && !map.hasLayer(busLayer)) {
      busLayer.addTo(map);
    } else if (!showBusA1 && map.hasLayer(busLayer)) {
      map.removeLayer(busLayer);
    }
  }, [showBusA1]);

  return <div id="map" ref={mapNodeRef} aria-label="Mapa de Tunja"></div>;
}

export default MapCanvas;

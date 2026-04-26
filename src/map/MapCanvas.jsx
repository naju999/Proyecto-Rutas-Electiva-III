import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MAP_CONFIG } from './legacyMapConfig';
import {
  addMarkersAndFeatures,
  createSelectedRouteLayer,
  initializeBaseLayers
} from './legacyMapAdapter';

function MapCanvas({
  selectedRoute,
  coordinates,
  onMapReady,
  onMapError,
  onCoordinatesChange
}) {
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const baseLayersRef = useRef({});
  const selectedRouteLayerRef = useRef(null);
  const selectedLocationLayerRef = useRef(null);
  const selectedRouteRef = useRef(selectedRoute);
  const coordinatesRef = useRef(coordinates);
  const onMapReadyRef = useRef(onMapReady);
  const onMapErrorRef = useRef(onMapError);
  const onCoordinatesChangeRef = useRef(onCoordinatesChange);

  const syncSelectedLocation = (lat, lng) => {
    const locationLayer = selectedLocationLayerRef.current;

    if (!locationLayer) {
      return;
    }

    locationLayer.clearLayers();

    L.circleMarker([lat, lng], {
      radius: 9,
      fillColor: '#0c67ff',
      color: '#083c9b',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.92
    })
      .bindPopup('<strong>Ubicacion seleccionada</strong>')
      .addTo(locationLayer);
  };

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
    coordinatesRef.current = coordinates;

    if (!mapRef.current || !coordinates) {
      return;
    }

    syncSelectedLocation(coordinates.lat, coordinates.lng);
  }, [coordinates]);

  useEffect(() => {
    selectedRouteRef.current = selectedRoute;
  }, [selectedRoute]);

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
    baseLayers.openstreetmap.addTo(map);

    selectedLocationLayerRef.current = L.layerGroup().addTo(map);

    addMarkersAndFeatures(L, map);

    map.on('click', (event) => {
      onCoordinatesChangeRef.current(event.latlng.lat, event.latlng.lng);
      syncSelectedLocation(event.latlng.lat, event.latlng.lng);
    });

    map.on('contextmenu', (event) => {
      onCoordinatesChangeRef.current(event.latlng.lat, event.latlng.lng);
      syncSelectedLocation(event.latlng.lat, event.latlng.lng);
    });

    const center = map.getCenter();
    const initialCoordinates = coordinatesRef.current ?? center;
    syncSelectedLocation(initialCoordinates.lat, initialCoordinates.lng);
    onCoordinatesChangeRef.current(initialCoordinates.lat, initialCoordinates.lng);

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

    const handleFocusSelectedLocation = (event) => {
      const lat = Number(event?.detail?.lat);
      const lng = Number(event?.detail?.lng);
      const zoom = Number(event?.detail?.zoom ?? 16);

      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        map.flyTo([lat, lng], zoom);
      }
    };

    window.addEventListener('map:focus-selected-location', handleFocusSelectedLocation);

    onMapReadyRef.current({
      centerMap: () => map.flyTo(MAP_CONFIG.center, MAP_CONFIG.initialZoom),
      zoomIn: () => map.zoomIn(),
      zoomOut: () => map.zoomOut(),
      focusCoordinates: (lat, lng, zoom = 16) => map.flyTo([lat, lng], zoom),
      invalidateSize: () => map.invalidateSize(false)
    });

    return () => {
      isDisposed = true;
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleWindowResize);
      window.removeEventListener('map:focus-selected-location', handleFocusSelectedLocation);
      onMapReadyRef.current(null);
      map.remove();
      mapRef.current = null;
      selectedRouteLayerRef.current = null;
      selectedLocationLayerRef.current = null;
      baseLayersRef.current = {};
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const previousLayer = selectedRouteLayerRef.current;
    if (previousLayer && map.hasLayer(previousLayer)) {
      map.removeLayer(previousLayer);
      selectedRouteLayerRef.current = null;
    }

    if (!selectedRoute) {
      return;
    }

    let cancelled = false;

    createSelectedRouteLayer(L, selectedRoute)
      .then((nextLayer) => {
        if (cancelled || !nextLayer || !mapRef.current) {
          return;
        }

        selectedRouteLayerRef.current = nextLayer;
        nextLayer.addTo(mapRef.current);

        try {
          const bounds = nextLayer.getBounds?.();
          if (bounds?.isValid?.()) {
            mapRef.current.fitBounds(bounds, { padding: [24, 24] });
          }
        } catch (_error) {
          // Ignora errores de ajuste de bounds para no bloquear el render.
        }
      })
      .catch((error) => {
        if (!cancelled) {
          onMapErrorRef.current(`No se pudo cargar ${selectedRoute.title}: ${error.message}`);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRoute]);

  return <div id="map" ref={mapNodeRef} aria-label="Mapa de Tunja"></div>;
}

export default MapCanvas;

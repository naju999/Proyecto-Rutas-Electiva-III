import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MAP_CONFIG } from './legacyMapConfig';
import {
  createSelectedRouteLayer,
  initializeBaseLayers
} from './legacyMapAdapter';

function MapCanvas({
  selectedRoute,
  routeGeoJSON,
  stops,
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
  const routeGeoJSONRef = useRef(routeGeoJSON);
  const stopsRef = useRef(stops);
  const coordinatesRef = useRef(coordinates);
  const onMapReadyRef = useRef(onMapReady);
  const onMapErrorRef = useRef(onMapError);
  const onCoordinatesChangeRef = useRef(onCoordinatesChange);

  const renderSelection = (selection) => {
    const locationLayer = selectedLocationLayerRef.current;

    if (!locationLayer) {
      return;
    }

    locationLayer.clearLayers();

    const origin = selection?.origin ?? null;
    const destination = selection?.destination ?? null;

    if (origin && destination) {
      L.polyline(
        [
          [origin.lat, origin.lng],
          [destination.lat, destination.lng]
        ],
        {
          color: '#0c67ff',
          weight: 4,
          opacity: 0.8,
          dashArray: '8 10'
        }
      ).addTo(locationLayer);
    }

    if (origin) {
      L.circleMarker([origin.lat, origin.lng], {
        radius: 9,
        fillColor: '#111111',
        color: '#111111',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.92
      })
        .bindPopup(`<strong>Origen</strong><br/>${origin.label || 'Punto de partida'}`)
        .addTo(locationLayer);
    }

    if (destination) {
      L.circleMarker([destination.lat, destination.lng], {
        radius: 9,
        fillColor: '#111111',
        color: '#111111',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.92
      })
        .bindPopup(`<strong>Llegada</strong><br/>${destination.label || 'Punto de llegada'}`)
        .addTo(locationLayer);
    }
  };

  const syncSingleLocation = (lat, lng) => {
    renderSelection({
      origin: {
        lat,
        lng,
        label: 'Ubicacion seleccionada'
      }
    });
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

    syncSingleLocation(coordinates.lat, coordinates.lng);
  }, [coordinates]);

  useEffect(() => {
    selectedRouteRef.current = selectedRoute;
  }, [selectedRoute]);

  useEffect(() => {
    routeGeoJSONRef.current = routeGeoJSON;
  }, [routeGeoJSON]);

  useEffect(() => {
    stopsRef.current = stops;
  }, [stops]);

  const buildLayerFromDirectData = () => {
    const activeRouteGeoJson = routeGeoJSONRef.current ?? selectedRouteRef.current?.routeGeoJSON ?? null;
    const activeStops = stopsRef.current ?? selectedRouteRef.current?.stops ?? null;

    if (!activeRouteGeoJson && !activeStops) {
      return null;
    }

    const layerGroup = L.layerGroup();

    if (activeRouteGeoJson) {
      L.geoJSON(activeRouteGeoJson, {
        style: {
          color: '#0c67ff',
          weight: 5,
          opacity: 0.9,
          lineCap: 'round',
          lineJoin: 'round'
        }
      }).addTo(layerGroup);
    }

    if (Array.isArray(activeStops)) {
      activeStops.forEach((stop, index) => {
        const stopCoordinates = Array.isArray(stop?.geometry?.coordinates)
          ? stop.geometry.coordinates
          : null;

        const lat = Number(stop?.lat ?? stop?.latitude ?? stopCoordinates?.[1]);
        const lng = Number(stop?.lng ?? stop?.lon ?? stop?.longitude ?? stopCoordinates?.[0]);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return;
        }

        const stopName =
          stop?.name ??
          stop?.label ??
          stop?.properties?.name ??
          stop?.properties?.Name ??
          'Parada';

        L.circleMarker([lat, lng], {
          radius: 6,
          fillColor: '#f97316',
          color: '#9a3412',
          weight: 1,
          opacity: 1,
          fillOpacity: 0.95
        })
          .bindPopup(`<strong>Parada ${index + 1}</strong><br/>${stopName}`)
          .addTo(layerGroup);
      });
    } else if (activeStops && typeof activeStops === 'object') {
      L.geoJSON(activeStops, {
        pointToLayer: (feature, latlng) =>
          L.circleMarker(latlng, {
            radius: 6,
            fillColor: '#f97316',
            color: '#9a3412',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.95
          }).bindPopup(`<strong>Parada</strong><br/>${feature?.properties?.name || 'Parada'}`)
      }).addTo(layerGroup);
    }

    return layerGroup;
  };

  useEffect(() => {
    if (!mapNodeRef.current || mapRef.current) {
      return undefined;
    }

    let isDisposed = false;

    const map = L.map(mapNodeRef.current, {
      zoomControl: true,
      minZoom: MAP_CONFIG.minZoom,
      maxZoom: MAP_CONFIG.maxZoom,
      maxBounds: MAP_CONFIG.bounds,
      maxBoundsViscosity: 1,
      worldCopyJump: false
    }).setView(MAP_CONFIG.center, MAP_CONFIG.initialZoom);

    mapRef.current = map;
    map.zoomControl.setPosition('topright');
    L.control.scale().addTo(map);

    const baseLayers = initializeBaseLayers(L);
    baseLayersRef.current = baseLayers;
    baseLayers.openstreetmap.addTo(map);

    selectedLocationLayerRef.current = L.layerGroup().addTo(map);

    map.on('click', (event) => {
      onCoordinatesChangeRef.current(event.latlng.lat, event.latlng.lng);
      syncSingleLocation(event.latlng.lat, event.latlng.lng);
      window.dispatchEvent(
        new CustomEvent('map:point-selected', {
          detail: {
            lat: event.latlng.lat,
            lng: event.latlng.lng,
            source: 'map-click'
          }
        })
      );
    });

    map.on('contextmenu', (event) => {
      onCoordinatesChangeRef.current(event.latlng.lat, event.latlng.lng);
      syncSingleLocation(event.latlng.lat, event.latlng.lng);
      window.dispatchEvent(
        new CustomEvent('map:point-selected', {
          detail: {
            lat: event.latlng.lat,
            lng: event.latlng.lng,
            source: 'map-contextmenu'
          }
        })
      );
    });

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

    const handleTripUpdate = (event) => {
      const origin = event?.detail?.origin ?? null;
      const destination = event?.detail?.destination ?? null;

      renderSelection({ origin, destination });

      try {
        const tripPoints = [origin, destination].filter(Boolean);

        if (tripPoints.length === 1) {
          map.flyTo([tripPoints[0].lat, tripPoints[0].lng], 15);
          return;
        }

        if (tripPoints.length === 2) {
          const bounds = L.latLngBounds(tripPoints.map((point) => [point.lat, point.lng]));
          map.fitBounds(bounds, { padding: [32, 32] });
        }
      } catch (_error) {
        // El ajuste de vista es solo una ayuda visual; no debe romper la interacción.
      }
    };

    const handleMarkTripPoints = (event) => {
      const origin = event?.detail?.origin ?? null;
      const destination = event?.detail?.destination ?? null;

      renderSelection({ origin, destination });

      try {
        const tripPoints = [origin, destination].filter(Boolean);

        if (tripPoints.length === 2) {
          const bounds = L.latLngBounds(tripPoints.map((point) => [point.lat, point.lng]));
          map.fitBounds(bounds, { padding: [50, 50] });
        }
      } catch (_error) {
        // El ajuste de vista es solo una ayuda visual; no debe romper la interacción.
      }
    };

    window.addEventListener('map:focus-selected-location', handleFocusSelectedLocation);
    window.addEventListener('map:trip-updated', handleTripUpdate);
    window.addEventListener('map:mark-trip-points', handleMarkTripPoints);

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
      window.removeEventListener('map:trip-updated', handleTripUpdate);
      window.removeEventListener('map:mark-trip-points', handleMarkTripPoints);
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

    let cancelled = false;

    const directLayer = buildLayerFromDirectData();
    const renderPromise = directLayer
      ? Promise.resolve(directLayer)
      : selectedRoute
        ? createSelectedRouteLayer(L, selectedRoute)
        : Promise.resolve(null);

    renderPromise
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
          const routeTitle = selectedRoute?.title || 'la ruta seleccionada';
          onMapErrorRef.current(`No se pudo cargar ${routeTitle}: ${error.message}`);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRoute, routeGeoJSON, stops]);

  return (
    <div className="map-canvas-wrapper">
      <div id="map" ref={mapNodeRef} aria-label="Mapa de Tunja"></div>
    </div>
  );
}

export default MapCanvas;

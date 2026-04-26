import { MAP_CONFIG } from './legacyMapConfig';

export function initializeBaseLayers(L) {
  return {
    openstreetmap: L.tileLayer(MAP_CONFIG.layers.openstreetmap.url, {
      attribution: MAP_CONFIG.layers.openstreetmap.attribution,
      minZoom: MAP_CONFIG.minZoom,
      maxZoom: MAP_CONFIG.maxZoom
    }),
    satellite: L.tileLayer(MAP_CONFIG.layers.satellite.url, {
      attribution: MAP_CONFIG.layers.satellite.attribution,
      minZoom: MAP_CONFIG.minZoom,
      maxZoom: MAP_CONFIG.maxZoom
    }),
    terrain: L.tileLayer(MAP_CONFIG.layers.terrain.url, {
      attribution: MAP_CONFIG.layers.terrain.attribution,
      minZoom: MAP_CONFIG.minZoom,
      maxZoom: MAP_CONFIG.maxZoom
    })
  };
}

export function addMarkersAndFeatures(L, map) {
  const featureGroup = L.layerGroup();

  L.circleMarker(MAP_CONFIG.center, {
    radius: 8,
    fillColor: '#cc2017',
    color: '#8e0f0a',
    weight: 2,
    opacity: 1,
    fillOpacity: 0.9
  })
    .bindPopup('<div class="popup-title">Tunja, Boyaca</div><p>Capital del departamento de Boyaca</p>')
    .addTo(featureGroup);

  L.circle(MAP_CONFIG.center, {
    color: '#667eea',
    fillColor: '#667eea',
    fillOpacity: 0.1,
    radius: 3000,
    weight: 2
  }).addTo(featureGroup);

  MAP_CONFIG.pointsOfInterest.forEach((punto) => {
    L.circleMarker(punto.coords, {
      radius: 8,
      fillColor: '#0066cc',
      color: '#003d99',
      weight: 2,
      opacity: 0.8,
      fillOpacity: 0.7
    })
      .bindPopup(`<div class="popup-title">${punto.nombre}</div><p>${punto.descripcion}</p>`)
      .addTo(featureGroup);
  });

  featureGroup.addTo(map);
  return featureGroup;
}

export async function getRoadAwarePath(stops) {
  const fallbackPath = stops.map((stop) => [stop.lat, stop.lng]);

  try {
    const waypoints = stops.map((stop) => `${stop.lng},${stop.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${waypoints}?overview=full&geometries=geojson&steps=false&continue_straight=true`;
    const response = await fetch(url, { signal: AbortSignal.timeout(12000) });

    if (!response.ok) {
      return fallbackPath;
    }

    const data = await response.json();
    const routeCoords = data?.routes?.[0]?.geometry?.coordinates;

    if (!Array.isArray(routeCoords) || routeCoords.length < 2) {
      return fallbackPath;
    }

    return routeCoords.map(([lng, lat]) => [lat, lng]);
  } catch (error) {
    return fallbackPath;
  }
}

export async function createBusRouteLayer(L, map) {
  const routeA1 = MAP_CONFIG.busRoutes.a1;
  const routeGroup = L.layerGroup();
  const sortedStops = [...routeA1.stops].sort((a, b) => a.order - b.order);
  const roadPath = await getRoadAwarePath(sortedStops);

  L.polyline(roadPath, {
    color: routeA1.color || '#ff6b00',
    weight: 5,
    opacity: 0.85,
    lineCap: 'round',
    lineJoin: 'round'
  })
    .bindPopup(`<strong>${routeA1.name}</strong>`)
    .addTo(routeGroup);

  sortedStops.forEach((stop) => {
    L.circleMarker([stop.lat, stop.lng], {
      radius: 6,
      color: '#a84300',
      weight: 2,
      fillColor: '#ff8a3d',
      fillOpacity: 0.95
    })
      .bindPopup(`<strong>${stop.name}</strong>`)
      .addTo(routeGroup);
  });

  routeGroup.addTo(map);
  return routeGroup;
}

export function changeMapLayer(map, layers, nextLayerName, currentLayerName) {
  const baseNames = ['openstreetmap', 'satellite', 'terrain'];

  baseNames.forEach((name) => {
    const layer = layers[name];
    if (layer && map.hasLayer(layer)) {
      map.removeLayer(layer);
    }
  });

  if (layers[nextLayerName]) {
    layers[nextLayerName].addTo(map);
    return nextLayerName;
  }

  return currentLayerName;
}

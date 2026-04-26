import { MAP_CONFIG } from './legacyMapConfig';

const ROUTE_ROLE_META = {
  dispatch_points: {
    label: 'Despachos',
    color: '#2563eb',
    fillColor: '#60a5fa',
    pointRadius: 6,
    lineWeight: 3,
    dashArray: '4 4'
  },
  outbound_route: {
    label: 'Sentido de ida',
    color: '#15803d',
    fillColor: '#4ade80',
    pointRadius: 5,
    lineWeight: 4,
    dashArray: null
  },
  inbound_route: {
    label: 'Sentido de regreso',
    color: '#ea580c',
    fillColor: '#fb923c',
    pointRadius: 5,
    lineWeight: 4,
    dashArray: '8 6'
  }
};

export function initializeBaseLayers(L) {
  return {
    openstreetmap: L.tileLayer(MAP_CONFIG.layers.openstreetmap.url, {
      attribution: MAP_CONFIG.layers.openstreetmap.attribution,
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

function buildFeaturePopup(routeTitle, roleLabel, feature) {
  const featureName =
    feature?.properties?.Name ||
    feature?.properties?.name ||
    feature?.properties?.nombre ||
    roleLabel;

  return `<strong>${routeTitle}</strong><br/>${roleLabel}<br/>${featureName}`;
}

export async function createSelectedRouteLayer(L, selectedRoute) {
  if (!selectedRoute?.files) {
    return null;
  }

  const routeGroup = L.layerGroup();
  const fileEntries = Object.entries(selectedRoute.files);

  for (const [roleKey, filePath] of fileEntries) {
    if (!filePath) {
      continue;
    }

    const roleMeta = ROUTE_ROLE_META[roleKey] ?? {
      label: roleKey,
      color: '#334155',
      fillColor: '#64748b',
      pointRadius: 5,
      lineWeight: 3,
      dashArray: null
    };

    const response = await fetch(filePath);
    if (!response.ok) {
      throw new Error(`No se pudo cargar ${filePath} (${response.status})`);
    }

    const geoJsonData = await response.json();

    const geoJsonLayer = L.geoJSON(geoJsonData, {
      style: {
        color: roleMeta.color,
        weight: roleMeta.lineWeight,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
        dashArray: roleMeta.dashArray ?? undefined
      },
      pointToLayer: (_feature, latlng) => {
        return L.circleMarker(latlng, {
          radius: roleMeta.pointRadius,
          color: roleMeta.color,
          weight: 2,
          fillColor: roleMeta.fillColor,
          fillOpacity: 0.95
        });
      },
      onEachFeature: (feature, layer) => {
        layer.bindPopup(buildFeaturePopup(selectedRoute.title, roleMeta.label, feature));
      }
    });

    geoJsonLayer.addTo(routeGroup);
  }

  return routeGroup;
}

export function changeMapLayer(map, layers, nextLayerName, currentLayerName) {
  const baseNames = ['openstreetmap'];

  baseNames.forEach((name) => {
    const layer = layers[name];
    if (layer && map.hasLayer(layer)) {
      map.removeLayer(layer);
    }
  });

  if (layers.openstreetmap) {
    layers.openstreetmap.addTo(map);
    return 'openstreetmap';
  }

  return currentLayerName;
}

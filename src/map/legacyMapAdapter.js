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
    label: 'Linea verde',
    color: '#15803d',
    fillColor: '#4ade80',
    pointRadius: 5,
    lineWeight: 4,
    dashArray: null
  },
  inbound_route: {
    label: 'Linea naranja',
    color: '#ea580c',
    fillColor: '#fb923c',
    pointRadius: 5,
    lineWeight: 4,
    dashArray: '8 6'
  }
};

function normalizeLabel(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getDispatchDirectionHint(feature) {
  const explicitDirection = normalizeLabel(feature?.properties?.direction);
  if (explicitDirection === 'outbound route' || explicitDirection === 'outboundroute') {
    return 'outbound_route';
  }

  if (explicitDirection === 'inbound route' || explicitDirection === 'inboundroute') {
    return 'inbound_route';
  }

  const explicitRole = normalizeLabel(feature?.properties?.role);
  if (explicitRole === 'return point' || explicitRole === 'returnpoint') {
    return 'inbound_route';
  }

  const combinedText = normalizeLabel(
    [feature?.properties?.name, feature?.properties?.description, feature?.properties?.label].filter(Boolean).join(' ')
  );

  if (!combinedText) {
    return null;
  }

  if (combinedText.includes('retorno') || combinedText.includes('return')) {
    return 'inbound_route';
  }

  if (combinedText.includes('despacho') || combinedText.includes('eds') || combinedText.includes('salida')) {
    return 'outbound_route';
  }

  return null;
}

function resolveDispatchDirection(feature, fallbackDirection = null) {
  return getDispatchDirectionHint(feature) || fallbackDirection;
}

function matchesSelectedDispatch(feature, selectedRoute) {
  const selectedDispatchName = normalizeLabel(selectedRoute?.dispatchPointName);

  if (!selectedDispatchName) {
    return true;
  }

  const featureName = normalizeLabel(
    feature?.properties?.Name || feature?.properties?.name || feature?.properties?.nombre || feature?.properties?.label
  );

  if (!featureName) {
    return false;
  }

  return featureName === selectedDispatchName || featureName.includes(selectedDispatchName) || selectedDispatchName.includes(featureName);
}

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
  return L.layerGroup().addTo(map);
}

function buildFeaturePopup(routeTitle, roleLabel, feature) {
  const featureName =
    feature?.properties?.Name ||
    feature?.properties?.name ||
    feature?.properties?.nombre ||
    roleLabel;

  return `<strong>${routeTitle}</strong><br/>${roleLabel}<br/>${featureName}`;
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

function toLatLng(coord) {
  if (!Array.isArray(coord) || coord.length < 2) {
    return null;
  }

  return [Number(coord[1]), Number(coord[0])];
}

function getRouteStartEndPoints(routeGeoJson) {
  const lineFeatures = Array.isArray(routeGeoJson?.features)
    ? routeGeoJson.features.filter((feature) => {
        const geometryType = feature?.geometry?.type;
        return geometryType === 'LineString' || geometryType === 'MultiLineString';
      })
    : [];

  if (lineFeatures.length === 0) {
    return { start: null, end: null };
  }

  const firstCoordinates = getFeatureCoordinates(lineFeatures[0]);
  const lastCoordinates = getFeatureCoordinates(lineFeatures[lineFeatures.length - 1]);

  return {
    start: toLatLng(firstCoordinates[0]),
    end: toLatLng(lastCoordinates[lastCoordinates.length - 1])
  };
}

function distanceSquared(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) {
    return Number.POSITIVE_INFINITY;
  }

  const dLat = a[0] - b[0];
  const dLng = a[1] - b[1];
  return dLat * dLat + dLng * dLng;
}

function getDispatchFeatureLatLng(feature) {
  const coords = getFeatureCoordinates(feature);
  const first = coords[0];
  return toLatLng(first);
}

function extractOrderedPointsFromGeoJson(geoJsonData) {
  if (!geoJsonData) return [];
  const features = Array.isArray(geoJsonData.features) ? geoJsonData.features : [];

  // If Point features (sampled) preserve order by properties when available
  if (features.length && features[0]?.geometry?.type === 'Point') {
    const sorted = features.slice().sort((a, b) => {
      const sa = Number(a?.properties?._segmentIndex ?? 0);
      const sb = Number(b?.properties?._segmentIndex ?? 0);
      if (sa !== sb) return sa - sb;
      const pa = Number(a?.properties?._position ?? 0);
      const pb = Number(b?.properties?._position ?? 0);
      return pa - pb;
    });

    return sorted.map((f) => getDispatchFeatureLatLng(f)).filter(Boolean);
  }

  // otherwise concatenate line coordinates
  const lineFeatures = features.filter((feature) => {
    const t = feature?.geometry?.type;
    return t === 'LineString' || t === 'MultiLineString';
  });

  const coords = [];
  lineFeatures.forEach((feature) => {
    const fc = getFeatureCoordinates(feature) || [];
    fc.forEach((c) => {
      const ll = toLatLng(c);
      if (ll) coords.push(ll);
    });
  });

  return coords;
}

function findClosestIndexInRoute(routePoints, targetLatLng) {
  if (!Array.isArray(routePoints) || routePoints.length === 0 || !Array.isArray(targetLatLng)) return null;

  let bestIndex = null;
  let bestDist = Infinity;

  for (let i = 0; i < routePoints.length; i += 1) {
    const pt = routePoints[i];
    if (!pt) continue;
    const d = distanceSquared(pt, targetLatLng);
    if (d < bestDist) {
      bestDist = d;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function getDirectionKeyFromSelectedRoute(selectedRoute) {
  const hasOutbound = Boolean(selectedRoute?.files?.outbound_route);
  const hasInbound = Boolean(selectedRoute?.files?.inbound_route);

  if (hasOutbound && !hasInbound) {
    return 'outbound_route';
  }

  if (hasInbound && !hasOutbound) {
    return 'inbound_route';
  }

  return null;
}

function isRoutesView(selectedRoute) {
  return Boolean(selectedRoute?.files?.outbound_route && selectedRoute?.files?.inbound_route);
}

function getLineColorByDirection(directionKey) {
  if (directionKey === 'outbound_route') {
    return {
      lineLabel: 'Linea verde',
      color: '#15803d',
      fillColor: '#4ade80'
    };
  }

  return {
    lineLabel: 'Linea naranja',
    color: '#ea580c',
    fillColor: '#fb923c'
  };
}

function reverseGeoJsonDirection(geoJsonData) {
  if (!Array.isArray(geoJsonData?.features)) {
    return geoJsonData;
  }

  const features = geoJsonData.features.slice().reverse().map((feature, index) => {
    const geometry = feature?.geometry ?? null;
    const reversedFeature = {
      ...feature,
      properties: {
        ...(feature?.properties ?? {})
      }
    };

    if (geometry?.type === 'LineString' && Array.isArray(geometry.coordinates)) {
      reversedFeature.geometry = {
        ...geometry,
        coordinates: geometry.coordinates.slice().reverse()
      };
    } else if (geometry?.type === 'MultiLineString' && Array.isArray(geometry.coordinates)) {
      reversedFeature.geometry = {
        ...geometry,
        coordinates: geometry.coordinates
          .slice()
          .reverse()
          .map((line) => (Array.isArray(line) ? line.slice().reverse() : line))
      };
    } else if (geometry?.type === 'MultiPoint' && Array.isArray(geometry.coordinates)) {
      reversedFeature.geometry = {
        ...geometry,
        coordinates: geometry.coordinates.slice().reverse()
      };
    }

    if (typeof reversedFeature.properties._position === 'number') {
      reversedFeature.properties._position = index;
    }

    return reversedFeature;
  });

  return {
    ...geoJsonData,
    features
  };
}

function getRouteLineDisplayName(selectedRoute, roleKey) {
  const sourceFileName = selectedRoute?.source_files?.[roleKey] || '';
  const routeCode = selectedRoute?.code || selectedRoute?.id || '';
  const clean = String(sourceFileName)
    .replace(/\.geojson$/i, '')
    .replace(new RegExp(`^${routeCode}-`, 'i'), '')
    .replace(/-/g, ' - ')
    .trim();

  const lineLabel = roleKey === 'outbound_route' ? 'linea verde' : 'linea naranja';
  return clean ? `${lineLabel} ${clean}` : lineLabel;
}

export async function createSelectedRouteLayer(L, selectedRoute) {
  if (!selectedRoute?.files) {
    return null;
  }

  const routeGroup = L.layerGroup();
  const fileEntries = Object.entries(selectedRoute.files);

  const loadedGeoJsonByRole = {};

  for (const [roleKey, filePath] of fileEntries) {
    if (!filePath) {
      continue;
    }

    const response = await fetch(filePath);
    if (!response.ok) {
      throw new Error(`No se pudo cargar ${filePath} (${response.status})`);
    }

    loadedGeoJsonByRole[roleKey] = await response.json();

    if (
      roleKey === 'inbound_route' &&
      selectedRoute?.files?.outbound_route &&
      selectedRoute.files.outbound_route === selectedRoute.files.inbound_route &&
      selectedRoute.files.inbound_route === filePath
    ) {
      loadedGeoJsonByRole[roleKey] = reverseGeoJsonDirection(loadedGeoJsonByRole[roleKey]);
    }
  }

  const outboundPoints = getRouteStartEndPoints(loadedGeoJsonByRole.outbound_route);
  const inboundPoints = getRouteStartEndPoints(loadedGeoJsonByRole.inbound_route);
  const singleDirection = getDirectionKeyFromSelectedRoute(selectedRoute);
  const inRoutesView = isRoutesView(selectedRoute);

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

    const geoJsonData = loadedGeoJsonByRole[roleKey];
    const filteredGeoJsonData =
      roleKey === 'dispatch_points' && selectedRoute?.dispatchPointName && Array.isArray(geoJsonData?.features)
        ? {
            ...geoJsonData,
            features: geoJsonData.features.filter((feature) => matchesSelectedDispatch(feature, selectedRoute))
          }
        : geoJsonData;

    const dispatchSourceData =
      roleKey === 'dispatch_points' && selectedRoute?.dispatchPointName && filteredGeoJsonData.features.length > 0
        ? filteredGeoJsonData
        : geoJsonData;

    const geoJsonLayer = L.geoJSON(
      roleKey === 'dispatch_points' ? dispatchSourceData : geoJsonData,
      {
      style: {
        color: roleMeta.color,
        weight: roleMeta.lineWeight,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
        dashArray: roleMeta.dashArray ?? undefined
      },
      pointToLayer: (feature, latlng) => {
        if (roleKey === 'dispatch_points') {
          const directionFromName = resolveDispatchDirection(feature, null);

          if (inRoutesView) {
            const featureLatLng = getDispatchFeatureLatLng(feature);

            // derive ordered points for each role and find closest indices
            const outboundRoutePoints = extractOrderedPointsFromGeoJson(loadedGeoJsonByRole.outbound_route || {});
            const inboundRoutePoints = extractOrderedPointsFromGeoJson(loadedGeoJsonByRole.inbound_route || {});

            const outIdx = findClosestIndexInRoute(outboundRoutePoints, featureLatLng);
            const inIdx = findClosestIndexInRoute(inboundRoutePoints, featureLatLng);

            const outHalf = outboundRoutePoints.length ? Math.floor(outboundRoutePoints.length / 2) : null;
            const inHalf = inboundRoutePoints.length ? Math.floor(inboundRoutePoints.length / 2) : null;

            // determine ownership: prefer the side where the index falls in the first/second half
            let chosenDirection = directionFromName;

            const outboundValid = outIdx !== null && outHalf !== null && outIdx <= outHalf;
            const inboundValid = inIdx !== null && inHalf !== null && inIdx >= inHalf;

            if (!chosenDirection && outboundValid && !inboundValid) chosenDirection = 'outbound_route';
            else if (!chosenDirection && inboundValid && !outboundValid) chosenDirection = 'inbound_route';
            else if (!chosenDirection && outIdx !== null && inIdx !== null) {
              // both plausible; choose the one with closer index to its start
              chosenDirection = outIdx <= inIdx ? 'outbound_route' : 'inbound_route';
            } else if (!chosenDirection) {
              // fallback to simple start-distance comparison
              const toOutbound = distanceSquared(featureLatLng, outboundPoints.start);
              const toInbound = distanceSquared(featureLatLng, inboundPoints.start);
              chosenDirection = toOutbound <= toInbound ? 'outbound_route' : 'inbound_route';
            }

            const directionMeta = getLineColorByDirection(chosenDirection);

            return L.circleMarker(latlng, {
              radius: 7,
              color: directionMeta.color,
              weight: 2,
              fillColor: directionMeta.fillColor,
              fillOpacity: 0.95
            });
          }

          if (singleDirection) {
            const directionMeta = getLineColorByDirection(singleDirection);
            return L.circleMarker(latlng, {
              radius: 8,
              color: directionMeta.color,
              weight: 2,
              fillColor: directionMeta.fillColor,
              fillOpacity: 0.95
            });
          }
        }

        return L.circleMarker(latlng, {
          radius: roleMeta.pointRadius,
          color: roleMeta.color,
          weight: 2,
          fillColor: roleMeta.fillColor,
          fillOpacity: 0.95
        });
      },
      onEachFeature: (feature, layer) => {
        if (roleKey === 'outbound_route' || roleKey === 'inbound_route') {
          layer.bindPopup(buildFeaturePopup(selectedRoute.title, getRouteLineDisplayName(selectedRoute, roleKey), feature));
          return;
        }

        if (roleKey === 'dispatch_points' && inRoutesView) {
          const featureLatLng = getDispatchFeatureLatLng(feature);
          const directionFromName = resolveDispatchDirection(feature, null);

          const outboundRoutePoints = extractOrderedPointsFromGeoJson(loadedGeoJsonByRole.outbound_route || {});
          const inboundRoutePoints = extractOrderedPointsFromGeoJson(loadedGeoJsonByRole.inbound_route || {});

          const outIdx = findClosestIndexInRoute(outboundRoutePoints, featureLatLng);
          const inIdx = findClosestIndexInRoute(inboundRoutePoints, featureLatLng);

          const outHalf = outboundRoutePoints.length ? Math.floor(outboundRoutePoints.length / 2) : null;
          const inHalf = inboundRoutePoints.length ? Math.floor(inboundRoutePoints.length / 2) : null;

          let chosenDirection = directionFromName;
          const outboundValid = outIdx !== null && outHalf !== null && outIdx <= outHalf;
          const inboundValid = inIdx !== null && inHalf !== null && inIdx >= inHalf;

          if (!chosenDirection && outboundValid && !inboundValid) chosenDirection = 'outbound_route';
          else if (!chosenDirection && inboundValid && !outboundValid) chosenDirection = 'inbound_route';
          else if (!chosenDirection && outIdx !== null && inIdx !== null) chosenDirection = outIdx <= inIdx ? 'outbound_route' : 'inbound_route';
          else if (!chosenDirection) {
            const toOutbound = distanceSquared(featureLatLng, outboundPoints.start);
            const toInbound = distanceSquared(featureLatLng, inboundPoints.start);
            chosenDirection = toOutbound <= toInbound ? 'outbound_route' : 'inbound_route';
          }

          const directionMeta = getLineColorByDirection(chosenDirection);
          layer.bindPopup(buildFeaturePopup(selectedRoute.title, `Despacho ${directionMeta.lineLabel.toLowerCase()}`, feature));
          return;
        }

        if (roleKey === 'dispatch_points' && singleDirection) {
          const directionMeta = getLineColorByDirection(singleDirection);
          layer.bindPopup(buildFeaturePopup(selectedRoute.title, `Despacho ${directionMeta.lineLabel.toLowerCase()}`, feature));
          return;
        }

        layer.bindPopup(buildFeaturePopup(selectedRoute.title, roleMeta.label, feature));
      }
      }
    );

    geoJsonLayer.addTo(routeGroup);

    if (!inRoutesView && singleDirection && (roleKey === 'outbound_route' || roleKey === 'inbound_route')) {
      const directionMeta = getLineColorByDirection(singleDirection);
      const { end } = getRouteStartEndPoints(geoJsonData);

      if (end) {
        L.circleMarker(end, {
          radius: 9,
          color: '#dc2626',
          fillColor: '#ef4444',
          weight: 2,
          fillOpacity: 0.95
        })
          .bindPopup(`<strong>${selectedRoute.title}</strong><br/>Punto final ${directionMeta.lineLabel.toLowerCase()}`)
          .addTo(routeGroup);
      }
    }
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

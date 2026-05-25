import { MAP_CONFIG } from './legacyMapConfig';

const TUNJA_SEARCH_BOUNDS = Object.freeze({
  south: 5.485,
  west: -73.414,
  north: 5.595,
  east: -73.295
});

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const ROUTE_MANIFEST_URL = '/data/routes-manifest.json';
const ROUTE_DIRECTION_META = {
  outbound_route: {
    label: 'Linea verde',
    color: '#15803d',
    softColor: '#dcfce7'
  },
  inbound_route: {
    label: 'Linea naranja',
    color: '#ea580c',
    softColor: '#ffedd5'
  }
};

const MAX_SINGLE_POINT_DISTANCE_METERS = 1200;
const MAX_ROUTE_COVERAGE_DISTANCE_METERS = 2400;
const MAX_RECOMMENDATIONS = 5;
const MIN_INDEX_DELTA = 3; // mínimo separación entre índices muestreados para considerar que el origen va antes que el destino

const TERMINAL_STOP = MAP_CONFIG.busRoutes?.a1?.stops?.find((stop) => stop.name === 'Terminal') ?? null;
const UPTC_STOP = MAP_CONFIG.busRoutes?.a1?.stops?.find((stop) => stop.name === 'UPTC') ?? null;
const MUISCAS_STOP = MAP_CONFIG.busRoutes?.a1?.stops?.find((stop) => stop.name === 'Los Muiscas') ?? null;
const PRADOS_STOP =
  MAP_CONFIG.busRoutes?.a1?.stops?.find((stop) => stop.name === 'Barrio Prados De San Luis') ?? null;

const LOCAL_TUNJA_PLACES = [
  {
    label: 'Plaza de Bolivar',
    aliases: ['plaza de bolivar', 'plaza bolivar', 'centro', 'centro historico'],
    coords: MAP_CONFIG.pointsOfInterest.find((place) => place.nombre === 'Plaza de Bolivar')?.coords
  },
  {
    label: 'Catedral Metropolitana',
    aliases: ['catedral', 'catedral metropolitana'],
    coords: MAP_CONFIG.pointsOfInterest.find((place) => place.nombre === 'Catedral Metropolitana')?.coords
  },
  {
    label: 'Iglesia de Santo Domingo',
    aliases: ['santo domingo', 'iglesia de santo domingo'],
    coords: MAP_CONFIG.pointsOfInterest.find((place) => place.nombre === 'Iglesia de Santo Domingo')?.coords
  },
  {
    label: 'Palacio de Narino (Tunja)',
    aliases: ['palacio de narino', 'gobernacion de boyaca', 'gobernacion'],
    coords: MAP_CONFIG.pointsOfInterest.find((place) => place.nombre === 'Palacio de Narino (Tunja)')?.coords
  },
  {
    label: 'Terminal de Transporte',
    aliases: ['terminal', 'terminal de transporte', 'terminal de transporte de tunja'],
    coords: TERMINAL_STOP ? [TERMINAL_STOP.lat, TERMINAL_STOP.lng] : null
  },
  {
    label: 'UPTC',
    aliases: ['uptc', 'universidad pedagogica y tecnologica de colombia'],
    coords: UPTC_STOP ? [UPTC_STOP.lat, UPTC_STOP.lng] : null
  },
  {
    label: 'Los Muiscas',
    aliases: ['los muiscas', 'muiscas'],
    coords: MUISCAS_STOP ? [MUISCAS_STOP.lat, MUISCAS_STOP.lng] : null
  },
  {
    label: 'Prados de San Luis',
    aliases: ['prados de san luis', 'prados'],
    coords: PRADOS_STOP ? [PRADOS_STOP.lat, PRADOS_STOP.lng] : null
  }
].filter((place) => Array.isArray(place.coords));

let routeManifestPromise = null;
const geoJsonPromiseCache = new Map();

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function projectPointToPlane(lat, lng, referenceLat) {
  const metersPerDegreeLat = 111132;
  const metersPerDegreeLng = 111320 * Math.cos(toRadians(referenceLat));

  return {
    x: lng * metersPerDegreeLng,
    y: lat * metersPerDegreeLat
  };
}

function distanceBetweenPointsMeters(pointA, pointB) {
  const averageLat = (pointA.lat + pointB.lat) / 2;
  const projectedA = projectPointToPlane(pointA.lat, pointA.lng, averageLat);
  const projectedB = projectPointToPlane(pointB.lat, pointB.lng, averageLat);
  const deltaX = projectedA.x - projectedB.x;
  const deltaY = projectedA.y - projectedB.y;

  return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
}

function distanceToSegmentMeters(point, start, end) {
  const referenceLat = (point.lat + start[0] + end[0]) / 3;
  const projectedPoint = projectPointToPlane(point.lat, point.lng, referenceLat);
  const projectedStart = projectPointToPlane(start[0], start[1], referenceLat);
  const projectedEnd = projectPointToPlane(end[0], end[1], referenceLat);

  const segmentX = projectedEnd.x - projectedStart.x;
  const segmentY = projectedEnd.y - projectedStart.y;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;

  if (segmentLengthSquared === 0) {
    const deltaX = projectedPoint.x - projectedStart.x;
    const deltaY = projectedPoint.y - projectedStart.y;
    return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  }

  let projection =
    ((projectedPoint.x - projectedStart.x) * segmentX + (projectedPoint.y - projectedStart.y) * segmentY) /
    segmentLengthSquared;

  projection = Math.max(0, Math.min(1, projection));

  const closestX = projectedStart.x + projection * segmentX;
  const closestY = projectedStart.y + projection * segmentY;
  const deltaX = projectedPoint.x - closestX;
  const deltaY = projectedPoint.y - closestY;

  return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
}

function flattenCoordinateGroups(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return [];
  }

  if (typeof coordinates[0]?.[0] === 'number') {
    return [coordinates];
  }

  return coordinates.flatMap((nestedCoordinates) => flattenCoordinateGroups(nestedCoordinates));
}

function measureGeometryDistance(geometry, point) {
  if (!geometry || !point) {
    return Infinity;
  }

  switch (geometry.type) {
    case 'Point':
      return distanceBetweenPointsMeters(point, { lat: geometry.coordinates[1], lng: geometry.coordinates[0] });

    case 'MultiPoint':
      return Math.min(
        ...geometry.coordinates.map((coordinates) =>
          distanceBetweenPointsMeters(point, { lat: coordinates[1], lng: coordinates[0] })
        )
      );

    case 'LineString': {
      const segments = geometry.coordinates;
      if (segments.length < 2) {
        return Infinity;
      }

      let bestDistance = Infinity;
      for (let index = 0; index < segments.length - 1; index += 1) {
        const distance = distanceToSegmentMeters(point, segments[index], segments[index + 1]);
        if (distance < bestDistance) {
          bestDistance = distance;
        }
      }

      return bestDistance;
    }

    case 'MultiLineString':
      return Math.min(
        ...geometry.coordinates.map((lineString) => measureGeometryDistance({ type: 'LineString', coordinates: lineString }, point))
      );

    case 'Polygon':
      return Math.min(
        ...flattenCoordinateGroups(geometry.coordinates).map((lineString) =>
          measureGeometryDistance({ type: 'LineString', coordinates: lineString }, point)
        )
      );

    case 'MultiPolygon':
      return Math.min(
        ...geometry.coordinates.map((polygon) => measureGeometryDistance({ type: 'Polygon', coordinates: polygon }, point))
      );

    case 'GeometryCollection':
      return Math.min(
        ...geometry.geometries.map((nestedGeometry) => measureGeometryDistance(nestedGeometry, point))
      );

    default:
      return Infinity;
  }
}

function measureGeoJsonDistance(geoJsonData, point) {
  const features = Array.isArray(geoJsonData?.features)
    ? geoJsonData.features
    : geoJsonData?.type === 'Feature'
      ? [geoJsonData]
      : geoJsonData?.type
        ? [{ type: 'Feature', geometry: geoJsonData, properties: {} }]
        : [];

  let bestMatch = {
    distanceMeters: Infinity,
    label: 'Trayecto'
  };

  features.forEach((feature) => {
    if (!feature?.geometry) {
      return;
    }

    const distanceMeters = measureGeometryDistance(feature.geometry, point);
    if (distanceMeters < bestMatch.distanceMeters) {
      bestMatch = {
        distanceMeters,
        label:
          feature.properties?.Name ||
          feature.properties?.name ||
          feature.properties?.nombre ||
          feature.properties?.label ||
          'Trayecto'
      };
    }
  });

  return bestMatch;
}

function findLocalTunjaPlace(query) {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return null;
  }

  for (const place of LOCAL_TUNJA_PLACES) {
    const aliasMatch = place.aliases.some((alias) => {
      const normalizedAlias = normalizeText(alias);
      return normalizedQuery.includes(normalizedAlias) || normalizedAlias.includes(normalizedQuery);
    });

    if (aliasMatch) {
      return {
        label: place.label,
        lat: place.coords[0],
        lng: place.coords[1],
        source: 'local'
      };
    }
  }

  return null;
}

function formatPointLabel(location) {
  if (!location) {
    return '';
  }

  return location.label || location.displayName || 'Punto en Tunja';
}

export function isInsideTunjaBounds(lat, lng) {
  const numericLat = Number(lat);
  const numericLng = Number(lng);

  return (
    Number.isFinite(numericLat) &&
    Number.isFinite(numericLng) &&
    numericLat >= TUNJA_SEARCH_BOUNDS.south &&
    numericLat <= TUNJA_SEARCH_BOUNDS.north &&
    numericLng >= TUNJA_SEARCH_BOUNDS.west &&
    numericLng <= TUNJA_SEARCH_BOUNDS.east
  );
}

export function formatDistanceMeters(distanceMeters) {
  const meters = Number(distanceMeters);

  if (!Number.isFinite(meters)) {
    return 'distancia no disponible';
  }

  if (meters < 1000) {
    return `${Math.max(25, Math.round(meters / 25) * 25)} m`;
  }

  return `${(meters / 1000).toFixed(1)} km`;
}

export async function resolveTunjaLocation(query) {
  const trimmedQuery = String(query ?? '').trim();

  if (!trimmedQuery) {
    return null;
  }

  const localMatch = findLocalTunjaPlace(trimmedQuery);
  if (localMatch) {
    return localMatch;
  }

  if (typeof fetch !== 'function') {
    return null;
  }

  const searchUrl = new URL(NOMINATIM_URL);
  searchUrl.searchParams.set('q', trimmedQuery);
  searchUrl.searchParams.set('format', 'jsonv2');
  searchUrl.searchParams.set('limit', '5');
  searchUrl.searchParams.set('addressdetails', '1');
  searchUrl.searchParams.set('countrycodes', 'co');
  searchUrl.searchParams.set('accept-language', 'es');
  searchUrl.searchParams.set(
    'viewbox',
    [TUNJA_SEARCH_BOUNDS.west, TUNJA_SEARCH_BOUNDS.north, TUNJA_SEARCH_BOUNDS.east, TUNJA_SEARCH_BOUNDS.south].join(',')
  );
  searchUrl.searchParams.set('bounded', '1');

  const response = await fetch(searchUrl.toString(), {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`No se pudo consultar ubicaciones en Tunja (${response.status}).`);
  }

  const parsedCandidates = await response.json();
  const candidates = Array.isArray(parsedCandidates) ? parsedCandidates : [];

  for (const candidate of candidates) {
    const lat = Number(candidate?.lat);
    const lng = Number(candidate?.lon);
    const displayName = String(candidate?.display_name ?? '');
    const address = candidate?.address ?? {};

    const mentionsTunja =
      /tunja/i.test(displayName) ||
      /tunja/i.test(address.city ?? '') ||
      /tunja/i.test(address.town ?? '') ||
      /tunja/i.test(address.municipality ?? '');

    if (mentionsTunja && isInsideTunjaBounds(lat, lng)) {
      return {
        label: candidate?.name || candidate?.display_name || trimmedQuery,
        displayName: candidate?.display_name || trimmedQuery,
        lat,
        lng,
        source: 'nominatim'
      };
    }
  }

  return null;
}

async function loadRouteManifest() {
  if (!routeManifestPromise) {
    routeManifestPromise = fetch(ROUTE_MANIFEST_URL, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`No se pudo cargar el manifest de rutas (${response.status}).`);
        }

        return response.json();
      })
      .then((manifest) => (Array.isArray(manifest?.routes) ? manifest.routes : []));
  }

  return routeManifestPromise;
}

async function loadGeoJson(filePath, sourceFileName) {
  // Try to prefer a pre-sampled points file placed in /database/sampled_points
  const sampledCandidate =
    typeof sourceFileName === 'string' && sourceFileName.length
      ? `/database/sampled_points/${sourceFileName.replace(/\.geojson$/i, '')}-samples.geojson`
      : null;

  const cacheKey = sampledCandidate ?? filePath;

  if (!geoJsonPromiseCache.has(cacheKey)) {
    const fetcher = async () => {
      if (sampledCandidate) {
        try {
          const sampledResp = await fetch(sampledCandidate, { cache: 'no-store' });
          if (sampledResp.ok) {
            const sampledJson = await sampledResp.json();
            // if the sampled file has meaningful points, use it
            if (Array.isArray(sampledJson?.features) && sampledJson.features.length > 0) {
              return sampledJson;
            }
          }
        } catch (e) {
          // ignore and fallback to original
        }
      }

      const resp = await fetch(filePath, { cache: 'no-store' });
      if (!resp.ok) {
        throw new Error(`No se pudo cargar ${filePath} (${resp.status}).`);
      }

      return resp.json();
    };

    geoJsonPromiseCache.set(cacheKey, fetcher());
  }

  return geoJsonPromiseCache.get(cacheKey);
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

function getGeoJsonFeatures(geoJsonData) {
  if (Array.isArray(geoJsonData?.features)) {
    return geoJsonData.features;
  }

  if (geoJsonData?.type === 'Feature') {
    return [geoJsonData];
  }

  if (geoJsonData?.type && geoJsonData?.geometry) {
    return [{ type: 'Feature', geometry: geoJsonData, properties: {} }];
  }

  return [];
}

function getRouteLineFeatures(geoJsonData) {
  return getGeoJsonFeatures(geoJsonData).filter((feature) => {
    const geometryType = feature?.geometry?.type;
    return geometryType === 'LineString' || geometryType === 'MultiLineString';
  });
}

function getDispatchPointFeatures(geoJsonData) {
  return getGeoJsonFeatures(geoJsonData).filter((feature) => {
    const geometryType = feature?.geometry?.type;
    return geometryType === 'Point' || geometryType === 'MultiPoint';
  });
}

function coordinateToPoint(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return null;
  }

  return {
    lat: Number(coordinates[1]),
    lng: Number(coordinates[0])
  };
}

function getRouteEndpoints(geoJsonData) {
  const lineFeatures = getRouteLineFeatures(geoJsonData);

  if (!lineFeatures.length) {
    return {
      start: null,
      end: null
    };
  }

  const firstCoordinates = getFeatureCoordinates(lineFeatures[0]);
  const lastCoordinates = getFeatureCoordinates(lineFeatures[lineFeatures.length - 1]);

  return {
    start: coordinateToPoint(firstCoordinates[0] ?? null),
    end: coordinateToPoint(lastCoordinates[lastCoordinates.length - 1] ?? null)
  };
}

function getFeatureDisplayName(feature) {
  return (
    feature?.properties?.Name ||
    feature?.properties?.name ||
    feature?.properties?.nombre ||
    feature?.properties?.label ||
    'Despacho'
  );
}

function getDispatchDirectionHint(feature) {
  const explicitDirection = normalizeText(feature?.properties?.direction);
  if (explicitDirection === 'outbound route' || explicitDirection === 'outboundroute') {
    return 'outbound_route';
  }

  if (explicitDirection === 'inbound route' || explicitDirection === 'inboundroute') {
    return 'inbound_route';
  }

  const explicitRole = normalizeText(feature?.properties?.role);
  if (explicitRole === 'return point' || explicitRole === 'returnpoint') {
    return 'inbound_route';
  }

  const combinedText = normalizeText(
    [feature?.properties?.name, feature?.properties?.description, feature?.properties?.label].filter(Boolean).join(' ')
  );

  if (!combinedText) {
    return null;
  }

  if (combinedText.includes('retorno') || combinedText.includes('retour') || combinedText.includes('return')) {
    return 'inbound_route';
  }

  if (combinedText.includes('despacho') || combinedText.includes('eds') || combinedText.includes('salida')) {
    return 'outbound_route';
  }

  return null;
}

function filterDispatchFeaturesForDirection(dispatchFeatures, direction) {
  const hintedFeatures = Array.isArray(dispatchFeatures)
    ? dispatchFeatures.filter((feature) => getDispatchDirectionHint(feature) === direction)
    : [];

  return hintedFeatures.length > 0 ? hintedFeatures : dispatchFeatures;
}

function getOrderedRoutePoints(geoJsonData) {
  // If the geojson is a sampled points feature collection, use feature order
  const features = Array.isArray(geoJsonData?.features) ? geoJsonData.features : [];

  if (features.length && features[0]?.geometry?.type === 'Point') {
    // sort by segment/position when provided so order is robust
    const sorted = features.slice().sort((a, b) => {
      const sa = Number(a?.properties?._segmentIndex ?? 0);
      const sb = Number(b?.properties?._segmentIndex ?? 0);
      if (sa !== sb) return sa - sb;
      const pa = Number(a?.properties?._position ?? 0);
      const pb = Number(b?.properties?._position ?? 0);
      return pa - pb;
    });

    return sorted
      .map((f) => getFeatureCoordinates(f)[0])
      .filter(Boolean)
      .map((coords) => coordinateToPoint(coords));
  }

  // otherwise fall back to line features concatenation
  const lineFeatures = getRouteLineFeatures(geoJsonData);
  const coords = [];
  lineFeatures.forEach((feature) => {
    const fc = getFeatureCoordinates(feature) || [];
    fc.forEach((c) => coords.push(c));
  });

  return coords.map((c) => coordinateToPoint(c));
}

function findClosestPointIndex(routePoints, targetPoint) {
  if (!Array.isArray(routePoints) || routePoints.length === 0 || !targetPoint) return null;

  let bestIndex = null;
  let bestDistance = Infinity;

  for (let i = 0; i < routePoints.length; i += 1) {
    const pt = routePoints[i];
    if (!pt) continue;
    const d = distanceBetweenPointsMeters(pt, targetPoint);
    if (d < bestDistance) {
      bestDistance = d;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function getClosestDispatchFeature(dispatchFeatures, targetPoint, routePoints = null, preferStart = null) {
  if (!Array.isArray(dispatchFeatures) || dispatchFeatures.length === 0 || !targetPoint) {
    return null;
  }

  let bestMatch = null;

  // If routePoints provided and preferStart is set, compute index filters
  let halfIndex = null;
  if (Array.isArray(routePoints) && routePoints.length > 0) {
    halfIndex = Math.floor(routePoints.length / 2);
  }

  dispatchFeatures.forEach((feature) => {
    const geometry = feature?.geometry;
    const geometryType = geometry?.type;

    let candidateCoordinates = null;
    if (geometryType === 'Point' && Array.isArray(geometry.coordinates)) {
      candidateCoordinates = geometry.coordinates;
    } else if (geometryType === 'MultiPoint' && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0) {
      candidateCoordinates = geometry.coordinates[0];
    }

    if (!candidateCoordinates) {
      return;
    }

    const candidatePoint = coordinateToPoint(candidateCoordinates);
    if (!candidatePoint) {
      return;
    }

    const distanceMeters = distanceBetweenPointsMeters(targetPoint, candidatePoint);

    // If routePoints supplied and preferStart/halfIndex available, compute candidate index and filter
    if (halfIndex !== null && preferStart !== null) {
      const candidateIndex = findClosestPointIndex(routePoints, candidatePoint);
      if (candidateIndex === null) return; // skip

      // if preferStart === true, accept only dispatches in the first half; if false, only in the second half
      if (preferStart === true && candidateIndex > halfIndex) return;
      if (preferStart === false && candidateIndex < halfIndex) return;
    }

    if (!bestMatch || distanceMeters < bestMatch.distanceMeters) {
      bestMatch = {
        feature,
        point: candidatePoint,
        distanceMeters,
        label: getFeatureDisplayName(feature)
      };
    }
  });

  return bestMatch;
}

function getRouteDirectionEntries(route) {
  return Object.entries(route?.files ?? {}).filter(
    ([roleKey, filePath]) =>
      (roleKey === 'outbound_route' || roleKey === 'inbound_route') && typeof filePath === 'string' && filePath.length > 0
  );
}

function getRouteDirectionMeta(direction) {
  return ROUTE_DIRECTION_META[direction] ?? {
    label: direction === 'outbound_route' ? 'Linea verde' : direction === 'inbound_route' ? 'Linea naranja' : 'Linea',
    color: '#334155',
    softColor: '#e2e8f0'
  };
}

export async function recommendTunjaBusRoute(origin, destination) {
  const originPoint = origin?.lat != null ? { lat: Number(origin.lat), lng: Number(origin.lng) } : null;
  const destinationPoint = destination?.lat != null ? { lat: Number(destination.lat), lng: Number(destination.lng) } : null;

  if (!originPoint || !destinationPoint) {
    return null;
  }

  const routes = await loadRouteManifest();

  const routeEvaluations = await Promise.all(
    routes.map(async (route) => {
      const directionEntries = getRouteDirectionEntries(route);

      if (!directionEntries.length) {
        return null;
      }

      const directionEvaluations = await Promise.all(
        directionEntries.map(async ([direction, filePath]) => {
          const sourceNameForDirection = route.source_files?.[direction] ?? null;
          const sourceNameForDispatch = route.source_files?.dispatch_points ?? null;
          const sharesSingleRouteFile = route.files?.outbound_route === route.files?.inbound_route;

          const [geoJsonData, dispatchGeoJsonData] = await Promise.all([
            loadGeoJson(filePath, sourceNameForDirection),
            loadGeoJson(route.files.dispatch_points, sourceNameForDispatch)
          ]);
          const directionalGeoJsonData =
            direction === 'inbound_route' && sharesSingleRouteFile ? reverseGeoJsonDirection(geoJsonData) : geoJsonData;
          const originMatch = measureGeoJsonDistance(directionalGeoJsonData, originPoint);
          const destinationMatch = measureGeoJsonDistance(directionalGeoJsonData, destinationPoint);
          const { start, end } = getRouteEndpoints(directionalGeoJsonData);
          const dispatchFeatures = filterDispatchFeaturesForDirection(
            getDispatchPointFeatures(dispatchGeoJsonData),
            direction
          );

          // derive ordered route points first so we can filter dispatches by route half
          const orderedPoints = getOrderedRoutePoints(directionalGeoJsonData);
          const startDispatchMatch = getClosestDispatchFeature(dispatchFeatures, start, orderedPoints, true);
          const endDispatchMatch = getClosestDispatchFeature(dispatchFeatures, end, orderedPoints, false);
          const dispatchAlignmentScore =
            (startDispatchMatch?.distanceMeters ?? 0) + (endDispatchMatch?.distanceMeters ?? 0);
          const endpointAlignmentScore =
            startDispatchMatch?.point && endDispatchMatch?.point
              ? distanceBetweenPointsMeters(originPoint, startDispatchMatch.point) +
                distanceBetweenPointsMeters(destinationPoint, endDispatchMatch.point)
              : 0;

          // compute ordered route points indices and check that origin comes before destination along route
          const originIndex = findClosestPointIndex(orderedPoints, originPoint);
          const destinationIndex = findClosestPointIndex(orderedPoints, destinationPoint);
          const directionConsistent =
            originIndex !== null &&
            destinationIndex !== null &&
            originIndex < destinationIndex &&
            destinationIndex - originIndex >= MIN_INDEX_DELTA;


          return {
            direction,
            filePath,
            originMatch,
            destinationMatch,
            startDispatchMatch,
            directionConsistent,
            endDispatchMatch,
            score:
              originMatch.distanceMeters +
              destinationMatch.distanceMeters +
              dispatchAlignmentScore * 0.35 +
              endpointAlignmentScore * 0.35
          };
        })
      );

      directionEvaluations.sort((first, second) => first.score - second.score);

      return {
        route,
        direction: directionEvaluations[0].direction,
        directionFilePath: directionEvaluations[0].filePath,
        directionLabel: getRouteDirectionMeta(directionEvaluations[0].direction).label,
        directionColor: getRouteDirectionMeta(directionEvaluations[0].direction).color,
        directionSoftColor: getRouteDirectionMeta(directionEvaluations[0].direction).softColor,
        dispatchPointName: directionEvaluations[0].startDispatchMatch?.label ?? null,
        endDispatchPointName: directionEvaluations[0].endDispatchMatch?.label ?? null,
        originMatch: directionEvaluations[0].originMatch,
        destinationMatch: directionEvaluations[0].destinationMatch,
        coverageScore: directionEvaluations[0].originMatch.distanceMeters + directionEvaluations[0].destinationMatch.distanceMeters,
        score: directionEvaluations[0].score
      };
    })
  );

  // first try: only keep routes that are direction-consistent (origin appears before destination along the route)
  let filtered = routeEvaluations.filter(
    (bestRoute) =>
      Boolean(bestRoute) &&
      bestRoute.originMatch.distanceMeters <= MAX_SINGLE_POINT_DISTANCE_METERS &&
      bestRoute.destinationMatch.distanceMeters <= MAX_SINGLE_POINT_DISTANCE_METERS &&
      bestRoute.coverageScore <= MAX_ROUTE_COVERAGE_DISTANCE_METERS &&
      bestRoute.directionConsistent === true
  );

  // if none are direction-consistent, fallback to previous behavior (keep candidates by proximity only)
  if (!filtered.length) {
    filtered = routeEvaluations.filter(
      (bestRoute) =>
        Boolean(bestRoute) &&
        bestRoute.originMatch.distanceMeters <= MAX_SINGLE_POINT_DISTANCE_METERS &&
        bestRoute.destinationMatch.distanceMeters <= MAX_SINGLE_POINT_DISTANCE_METERS &&
        bestRoute.coverageScore <= MAX_ROUTE_COVERAGE_DISTANCE_METERS
    );
  }

  const sortedRoutes = filtered.sort((first, second) => first.score - second.score).slice(0, MAX_RECOMMENDATIONS);

  if (!sortedRoutes.length) {
    return null;
  }

  return {
    recommendations: sortedRoutes.map((bestRoute) => ({
      route: bestRoute.route,
      direction: bestRoute.direction,
      directionFilePath: bestRoute.directionFilePath,
      directionLabel: bestRoute.directionLabel,
      directionColor: bestRoute.directionColor,
      directionSoftColor: bestRoute.directionSoftColor,
      dispatchPointName: bestRoute.dispatchPointName,
      endDispatchPointName: bestRoute.endDispatchPointName,
        directionConsistent: Boolean(bestRoute.directionConsistent),
      originMatch: {
        label: formatPointLabel(bestRoute.originMatch),
        distanceMeters: bestRoute.originMatch.distanceMeters
      },
      destinationMatch: {
        label: formatPointLabel(bestRoute.destinationMatch),
        distanceMeters: bestRoute.destinationMatch.distanceMeters
      },
      score: bestRoute.score
    }))
  };
}

export { TUNJA_SEARCH_BOUNDS };

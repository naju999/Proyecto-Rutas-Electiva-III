const ROUTE_RATINGS_STORAGE_KEY = 'tuRuta.routeRatings';
const ROUTE_RATINGS_API_URL = '/api/route-ratings';

import apiClient from './apiClient';

function createEmptySnapshot() {
  return {
    updatedAt: null,
    routes: {}
  };
}

function normalizeDirection(direction) {
  return String(direction ?? 'general').trim() || 'general';
}

function buildRouteKey(routeId, direction) {
  return `${String(routeId ?? 'unknown-route')}::${normalizeDirection(direction)}`;
}

function createRatingId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeRatingEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const rating = Math.max(1, Math.min(5, Number(entry.rating ?? 0)));

  return {
    id: String(entry.id ?? createRatingId()),
    rating,
    createdAt: String(entry.createdAt ?? new Date().toISOString()),
    routeId: String(entry.routeId ?? ''),
    routeTitle: String(entry.routeTitle ?? ''),
    direction: normalizeDirection(entry.direction),
    directionLabel: String(entry.directionLabel ?? ''),
    tripTitle: String(entry.tripTitle ?? ''),
    originLabel: String(entry.originLabel ?? ''),
    destinationLabel: String(entry.destinationLabel ?? ''),
    userEmail: String(entry.userEmail ?? ''),
    userName: String(entry.userName ?? '')
  };
}

function normalizeSnapshot(snapshot) {
  const source = snapshot && typeof snapshot === 'object' ? snapshot : createEmptySnapshot();
  const normalizedRoutes = {};

  Object.entries(source.routes ?? {}).forEach(([routeKey, entry]) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }

    const ratings = Array.isArray(entry.ratings)
      ? entry.ratings.map(normalizeRatingEntry).filter(Boolean)
      : [];
    const ratingCount = Number.isFinite(Number(entry.ratingCount)) ? Number(entry.ratingCount) : ratings.length;
    const ratingSum = Number.isFinite(Number(entry.ratingSum))
      ? Number(entry.ratingSum)
      : ratings.reduce((total, ratingItem) => total + Number(ratingItem.rating ?? 0), 0);
    const averageRating = ratingCount > 0 ? Number((ratingSum / ratingCount).toFixed(2)) : 0;

    normalizedRoutes[routeKey] = {
      routeId: String(entry.routeId ?? ''),
      routeTitle: String(entry.routeTitle ?? ''),
      direction: normalizeDirection(entry.direction),
      directionLabel: String(entry.directionLabel ?? ''),
      ratingCount,
      ratingSum,
      averageRating,
      updatedAt: String(entry.updatedAt ?? source.updatedAt ?? new Date().toISOString()),
      ratings
    };
  });

  return {
    updatedAt: String(source.updatedAt ?? null),
    routes: normalizedRoutes
  };
}

function readLocalSnapshot() {
  if (typeof window === 'undefined') {
    return createEmptySnapshot();
  }

  try {
    const rawSnapshot = window.localStorage.getItem(ROUTE_RATINGS_STORAGE_KEY) || '';
    return normalizeSnapshot(rawSnapshot ? JSON.parse(rawSnapshot) : null);
  } catch {
    return createEmptySnapshot();
  }
}

function writeLocalSnapshot(snapshot) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(ROUTE_RATINGS_STORAGE_KEY, JSON.stringify(normalizeSnapshot(snapshot)));
  } catch {
    // Si el almacenamiento local se llena, conservamos el estado en memoria.
  }
}

export function buildRouteRatingKey(routeId, direction) {
  return buildRouteKey(routeId, direction);
}

export function readRouteRatingsSnapshot() {
  return readLocalSnapshot();
}

export function getRouteRatingSummary(snapshot, routeId, direction) {
  const normalizedSnapshot = normalizeSnapshot(snapshot);
  const routeKey = buildRouteKey(routeId, direction);
  const entry = normalizedSnapshot.routes[routeKey] ?? null;

  return {
    routeKey,
    entry,
    ratingCount: entry?.ratingCount ?? 0,
    ratingSum: entry?.ratingSum ?? 0,
    averageRating: entry?.averageRating ?? 0
  };
}

export function addRouteRating(snapshot, payload) {
  const normalizedSnapshot = normalizeSnapshot(snapshot);
  const routeId = String(payload?.routeId ?? '');
  const direction = normalizeDirection(payload?.direction);
  const routeKey = buildRouteKey(routeId, direction);
  const existingEntry = normalizedSnapshot.routes[routeKey] ?? {
    routeId,
    routeTitle: String(payload?.routeTitle ?? ''),
    direction,
    directionLabel: String(payload?.directionLabel ?? ''),
    ratingCount: 0,
    ratingSum: 0,
    averageRating: 0,
    updatedAt: normalizedSnapshot.updatedAt ?? new Date().toISOString(),
    ratings: []
  };
  const nextRating = normalizeRatingEntry({
    id: payload?.id ?? createRatingId(),
    rating: payload?.rating,
    createdAt: payload?.createdAt ?? new Date().toISOString(),
    routeId,
    routeTitle: payload?.routeTitle ?? existingEntry.routeTitle,
    direction,
    directionLabel: payload?.directionLabel ?? existingEntry.directionLabel,
    tripTitle: payload?.tripTitle ?? '',
    originLabel: payload?.originLabel ?? '',
    destinationLabel: payload?.destinationLabel ?? '',
    userEmail: payload?.userEmail ?? '',
    userName: payload?.userName ?? ''
  });
  const ratings = [...existingEntry.ratings, nextRating];
  const ratingCount = existingEntry.ratingCount + 1;
  const ratingSum = existingEntry.ratingSum + Number(nextRating.rating ?? 0);
  const averageRating = ratingCount > 0 ? Number((ratingSum / ratingCount).toFixed(2)) : 0;
  const updatedAt = nextRating.createdAt;

  return {
    updatedAt,
    routes: {
      ...normalizedSnapshot.routes,
      [routeKey]: {
        routeId,
        routeTitle: nextRating.routeTitle,
        direction,
        directionLabel: nextRating.directionLabel,
        ratingCount,
        ratingSum,
        averageRating,
        updatedAt,
        ratings
      }
    }
  };
}

export async function hydrateRouteRatingsSnapshot() {
  const localSnapshot = readLocalSnapshot();

  if (typeof fetch !== 'function') {
    return localSnapshot;
  }

  try {
    const response = await apiClient.get(ROUTE_RATINGS_API_URL, { cache: 'no-store' });

    if (!response.ok) {
      return localSnapshot;
    }

    const remoteSnapshot = normalizeSnapshot(await response.json());
    if (Object.keys(remoteSnapshot.routes).length > 0 || Object.keys(localSnapshot.routes).length === 0) {
      writeLocalSnapshot(remoteSnapshot);
      return remoteSnapshot;
    }
  } catch {
    return localSnapshot;
  }

  return localSnapshot;
}

export async function persistRouteRatingsSnapshot(snapshot) {
  const normalizedSnapshot = normalizeSnapshot(snapshot);
  writeLocalSnapshot(normalizedSnapshot);

  if (typeof fetch !== 'function') {
    return normalizedSnapshot;
  }

  try {
    const response = await apiClient.post(ROUTE_RATINGS_API_URL, normalizedSnapshot);

    if (!response.ok) {
      return normalizedSnapshot;
    }

    const remoteSnapshot = normalizeSnapshot(await response.json());
    writeLocalSnapshot(remoteSnapshot);
    return remoteSnapshot;
  } catch {
    return normalizedSnapshot;
  }
}

const PENDING_DEVICE_LOCATION_KEY = 'tuRuta.pendingDeviceLocation';
const DEVICE_LOCATION_ENABLED_KEY = 'tuRuta.deviceLocationEnabled';
const NOMINATIM_REVERSE_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';

function buildCoordinatesLabel(latitude, longitude) {
  return `${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)}`;
}

function formatReverseAddress(address = {}) {
  const streetParts = [address.road, address.pedestrian, address.cycleway, address.footway]
    .filter(Boolean)
    .join(' ');

  const primaryParts = [
    streetParts,
    address.house_number ? `#${address.house_number}` : '',
    address.neighbourhood,
    address.suburb,
    address.city,
    address.town,
    address.village,
    address.municipality,
    address.county,
    address.state,
    address.country
  ].filter(Boolean);

  return primaryParts.join(', ');
}

export function formatDeviceLocation(location) {
  if (!location) {
    return '';
  }

  return (
    location.addressLine ||
    location.displayName ||
    location.label ||
    location.coordinatesLabel ||
    buildCoordinatesLabel(location.latitude, location.longitude)
  );
}

export async function reverseGeocodeLocation(latitude, longitude) {
  const url = new URL(NOMINATIM_REVERSE_ENDPOINT);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(latitude));
  url.searchParams.set('lon', String(longitude));
  url.searchParams.set('zoom', '18');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', 'es');

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Reverse geocoding failed with status ${response.status}`);
  }

  const data = await response.json();
  const addressLine = formatReverseAddress(data.address);

  return {
    displayName: data.display_name || '',
    addressLine,
    rawAddress: data.address || null
  };
}

export function persistPendingDeviceLocation(location) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(PENDING_DEVICE_LOCATION_KEY, JSON.stringify(location));
}

export function readPendingDeviceLocation() {
  if (typeof window === 'undefined') {
    return null;
  }

  const storedValue = window.localStorage.getItem(PENDING_DEVICE_LOCATION_KEY);

  if (!storedValue) {
    return null;
  }

  try {
    return JSON.parse(storedValue);
  } catch {
    return null;
  }
}

export function clearPendingDeviceLocation() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(PENDING_DEVICE_LOCATION_KEY);
}

export function isDeviceLocationEnabled() {
  if (typeof window === 'undefined') {
    return true;
  }

  const storedValue = window.localStorage.getItem(DEVICE_LOCATION_ENABLED_KEY);

  if (storedValue === null) {
    return true;
  }

  return storedValue !== 'false';
}

export function setDeviceLocationEnabled(enabled) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(DEVICE_LOCATION_ENABLED_KEY, enabled ? 'true' : 'false');
}

export function disableDeviceLocationUsage() {
  setDeviceLocationEnabled(false);
  clearPendingDeviceLocation();
}

export async function captureDeviceLocation() {
  if (!navigator.geolocation) {
    throw new Error('Tu navegador no soporta geolocalizacion.');
  }

  const position = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      resolve,
      reject,
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  });

  const latitude = position.coords.latitude;
  const longitude = position.coords.longitude;
  const reverseGeocode = await reverseGeocodeLocation(latitude, longitude);

  return {
    latitude,
    longitude,
    accuracy: position.coords.accuracy,
    capturedAt: new Date().toISOString(),
    source: 'browser-geolocation',
    displayName: reverseGeocode.displayName,
    addressLine: reverseGeocode.addressLine,
    coordinatesLabel: buildCoordinatesLabel(latitude, longitude),
    label: reverseGeocode.addressLine || reverseGeocode.displayName || buildCoordinatesLabel(latitude, longitude),
    rawAddress: reverseGeocode.rawAddress
  };
}

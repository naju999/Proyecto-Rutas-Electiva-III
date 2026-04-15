const COMMAND_TIMEOUT_MS = 6000;

async function getServiceWorkerTarget() {
  if (!('serviceWorker' in navigator)) {
    return null;
  }

  const registration = await navigator.serviceWorker.getRegistration('/');
  if (!registration) {
    return navigator.serviceWorker.controller || null;
  }

  return (
    navigator.serviceWorker.controller ||
    registration.active ||
    registration.waiting ||
    registration.installing ||
    null
  );
}

async function sendCommand(type, payload = {}) {
  const target = await getServiceWorkerTarget();
  if (!target) return null;

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timeoutId = window.setTimeout(() => {
      resolve(null);
    }, COMMAND_TIMEOUT_MS);

    channel.port1.onmessage = (event) => {
      window.clearTimeout(timeoutId);
      resolve(event.data ?? null);
    };

    target.postMessage({ type, payload }, [channel.port2]);
  });
}

export async function getTileCacheStats() {
  const result = await sendCommand('GET_TILE_CACHE_STATS');
  if (!result?.ok) return null;
  return result.payload ?? null;
}

export async function trimTileCache() {
  const result = await sendCommand('TRIM_TILE_CACHE');
  if (!result?.ok) return null;
  return result.payload ?? null;
}

export async function clearTileCache() {
  const result = await sendCommand('CLEAR_TILE_CACHE');
  if (!result?.ok) return null;
  return result.payload ?? null;
}

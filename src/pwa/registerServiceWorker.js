let activeRegistration = null;
let shouldReloadOnControllerChange = false;
const updateListeners = new Set();

async function clearBrowserCaches() {
  if (typeof caches === 'undefined') {
    return;
  }

  const cacheNames = await caches.keys();
  await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
}

async function unregisterExistingServiceWorkers() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
}

function notifyUpdateState(payload) {
  updateListeners.forEach((listener) => listener(payload));
}

function getWaitingWorker(registration) {
  if (!registration) return null;
  return registration.waiting || null;
}

function bindRegistrationUpdateLifecycle(registration) {
  const notifyIfWaiting = () => {
    const waitingWorker = getWaitingWorker(registration);
    notifyUpdateState({
      available: Boolean(waitingWorker)
    });
  };

  notifyIfWaiting();

  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    if (!installing) return;

    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed' && navigator.serviceWorker.controller) {
        notifyIfWaiting();
      }
    });
  });
}

export function subscribeServiceWorkerUpdates(listener) {
  updateListeners.add(listener);
  listener({
    available: Boolean(getWaitingWorker(activeRegistration))
  });

  return () => {
    updateListeners.delete(listener);
  };
}

export async function activateServiceWorkerUpdate() {
  const waitingWorker = getWaitingWorker(activeRegistration);
  if (!waitingWorker) {
    return false;
  }

  shouldReloadOnControllerChange = true;
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  return true;
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return { supported: false };
  }

  if (import.meta.env.DEV) {
    await unregisterExistingServiceWorkers();
    await clearBrowserCaches();
    return { supported: true, skipped: true, cleared: true };
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    activeRegistration = registration;
    bindRegistrationUpdateLifecycle(registration);

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.dispatchEvent(new CustomEvent('pwa:sw-controller-change'));

      if (shouldReloadOnControllerChange) {
        shouldReloadOnControllerChange = false;
        window.location.reload();
      }
    });

    return { supported: true, registration };
  } catch (error) {
    console.error('No se pudo registrar el Service Worker de la app.', error);
    return { supported: true, error };
  }
}

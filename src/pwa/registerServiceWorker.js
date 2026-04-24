let activeRegistration = null;
let shouldReloadOnControllerChange = false;
const updateListeners = new Set();

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

  const shouldRegisterInDev = window.__ENABLE_SW_DEV__ === true;
  if (import.meta.env.DEV && !shouldRegisterInDev) {
    return { supported: true, skipped: true };
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      type: 'module'
    });
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

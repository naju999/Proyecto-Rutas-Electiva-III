let deferredInstallPrompt = null;
let installed = false;
let initialized = false;
const listeners = new Set();

function isStandaloneMode() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function getInstallState() {
  return {
    canInstall: Boolean(deferredInstallPrompt) && !installed,
    installed
  };
}

function notifyInstallState() {
  const nextState = getInstallState();
  listeners.forEach((listener) => listener(nextState));
}

export function initPwaInstallListeners() {
  if (initialized) {
    return;
  }

  initialized = true;
  installed = isStandaloneMode();

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    notifyInstallState();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    installed = true;
    notifyInstallState();
  });

  window.addEventListener('pwa:sw-controller-change', () => {
    installed = isStandaloneMode();
    notifyInstallState();
  });

  notifyInstallState();
}

export function subscribePwaInstallState(listener) {
  listeners.add(listener);
  listener(getInstallState());

  return () => {
    listeners.delete(listener);
  };
}

export async function promptPwaInstall() {
  if (!deferredInstallPrompt) {
    return { accepted: false, unavailable: true };
  }

  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  notifyInstallState();

  return {
    accepted: choice?.outcome === 'accepted',
    unavailable: false
  };
}

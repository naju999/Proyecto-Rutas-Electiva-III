/**
 * ConnectivityMonitor - Detecta cambios de estado online/offline
 * Dispara sincronización automática cuando vuelve internet
 */

import syncQueue from './syncQueue';

class ConnectivityMonitor {
  constructor() {
    this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this.listeners = new Set();
    this.checkInterval = null;
    this.initialized = false;
    this.lastOnlineTime = Date.now();
    this.wasOffline = false;
  }

  /**
   * Inicializar monitor
   */
  init() {
    if (this.initialized) return;
    this.initialized = true;

    // Escuchar eventos del navegador
    window.addEventListener('online', this._handleOnline.bind(this));
    window.addEventListener('offline', this._handleOffline.bind(this));

    // Verificación periódica (cada 10s cuando offline)
    this._startPeriodicCheck();
  }

  /**
   * Obtener estado actual
   */
  getIsOnline() {
    return this.isOnline;
  }

  /**
   * Handler para online event
   */
  _handleOnline() {
    const wasOffline = this.wasOffline;
    this.isOnline = true;
    this.wasOffline = false;
    this.lastOnlineTime = Date.now();

    if (wasOffline) {
      this._notifyListeners('online-after-offline', { timestamp: this.lastOnlineTime });
      this._triggerSync();
    } else {
      this._notifyListeners('online', { timestamp: this.lastOnlineTime });
    }
  }

  /**
   * Handler para offline event
   */
  _handleOffline() {
    this.isOnline = false;
    this.wasOffline = true;
    this._notifyListeners('offline', { timestamp: Date.now() });
    this._startPeriodicCheck();
  }

  /**
   * Verificación periódica de conectividad
   */
  _startPeriodicCheck() {
    if (this.checkInterval) return;

    this.checkInterval = setInterval(() => {
      if (this.isOnline) {
        clearInterval(this.checkInterval);
        this.checkInterval = null;
        return;
      }

      // Intentar fetch simple a un recurso ligero
      this._checkConnectivity();
    }, 10000); // Cada 10 segundos
  }

  /**
   * Verificar conectividad con fetch
   */
  async _checkConnectivity() {
    try {
      const response = await fetch('/manifest.webmanifest', {
        method: 'HEAD',
        cache: 'no-store'
      });

      if (response.ok) {
        this._handleOnline();
      }
    } catch (err) {
      // Aún offline
    }
  }

  /**
   * Disparar sincronización
   */
  async _triggerSync() {
    try {
      const count = await syncQueue.count();

      if (count === 0) {
        return;
      }

      this._notifyListeners('sync-start', { pendingCount: count });

      // Usar Service Worker si está disponible
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        const channel = new MessageChannel();

        navigator.serviceWorker.controller.postMessage(
          {
            type: 'TRIGGER_SYNC',
            payload: { source: 'connectivity-monitor' }
          },
          [channel.port2]
        );

        // Esperar respuesta (timeout 30s)
        const syncResult = await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            resolve({ success: false, error: 'timeout' });
          }, 30000);

          channel.port1.onmessage = (event) => {
            clearTimeout(timeout);
            resolve(event.data);
          };
        });

        this._notifyListeners('sync-end', syncResult);
      }
    } catch (err) {
      console.error('Error triggering sync:', err);
      this._notifyListeners('sync-error', { error: err.message });
    }
  }

  /**
   * Agregar listener
   */
  onChange(callback) {
    this.listeners.add(callback);

    // Inicializar si no lo está
    if (!this.initialized) {
      this.init();
    }

    return () => this.listeners.delete(callback);
  }

  /**
   * Notificar cambios
   */
  _notifyListeners(eventType, payload) {
    this.listeners.forEach((callback) => {
      try {
        callback({ type: eventType, payload });
      } catch (err) {
        console.error('Error in ConnectivityMonitor listener:', err);
      }
    });
  }
}

const connectivityMonitor = new ConnectivityMonitor();

export default connectivityMonitor;

/**
 * Hook para usar en componentes React
 * const { isOnline, pendingCount } = useConnectivity();
 */
export function useConnectivity() {
  const [state, setState] = React.useState({
    isOnline: connectivityMonitor.getIsOnline(),
    pendingCount: 0,
    isSyncing: false,
    lastSyncTime: null
  });

  React.useEffect(() => {
    connectivityMonitor.init();

    const unsubConnect = connectivityMonitor.onChange((event) => {
      const { type } = event;

      if (type === 'online' || type === 'offline') {
        setState((prev) => ({
          ...prev,
          isOnline: connectivityMonitor.getIsOnline()
        }));
      } else if (type === 'sync-start') {
        setState((prev) => ({
          ...prev,
          isSyncing: true
        }));
      } else if (type === 'sync-end') {
        setState((prev) => ({
          ...prev,
          isSyncing: false,
          lastSyncTime: Date.now()
        }));
      }
    });

    const unsubQueue = syncQueue.onChange(async (event) => {
      const count = await syncQueue.count();
      setState((prev) => ({
        ...prev,
        pendingCount: count
      }));
    });

    return () => {
      unsubConnect();
      unsubQueue();
    };
  }, []);

  return state;
}

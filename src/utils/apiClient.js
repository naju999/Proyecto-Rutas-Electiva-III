/**
 * apiClient - Wrapper sobre fetch que captura errores offline
 * Almacena peticiones fallidas en SyncQueue para sincronizar después
 */

import syncQueue from '../pwa/syncQueue';
import connectivityMonitor from '../pwa/connectivityMonitor';

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 5000]; // ms

class ApiClient {
  constructor() {
    this.defaultHeaders = {
      'Content-Type': 'application/json'
    };
  }

  /**
   * Realizar petición con manejo de offline
   */
  async request(url, options = {}) {
    const method = options.method || 'GET';
    const headers = { ...this.defaultHeaders, ...options.headers };
    const timeout = options.timeout || 8000;

    // Métodos que NO se almacenan en cola (GET)
    const isReadOnly = method === 'GET' || method === 'HEAD';

    try {
      const response = await this._fetchWithTimeout(
        url,
        {
          method,
          headers,
          body: options.body,
          ...options
        },
        timeout
      );

      return response;
    } catch (error) {
      // Si es offline y es una petición de escritura, guardar en cola
      if (!isReadOnly && !connectivityMonitor.getIsOnline()) {
        const queueItem = await syncQueue.add({
          method,
          url,
          headers,
          body: options.body
        });

        // Retornar respuesta "pendiente"
        return {
          ok: false,
          status: 0,
          statusText: 'Pending Sync',
          offline: true,
          queueId: queueItem.id,
          json: async () => ({
            pending: true,
            message: 'Cambio guardado localmente - se sincronizará cuando hay conexión',
            queueId: queueItem.id
          })
        };
      }

      throw error;
    }
  }

  /**
   * GET request
   */
  async get(url, options = {}) {
    return this.request(url, { ...options, method: 'GET' });
  }

  /**
   * POST request
   */
  async post(url, body, options = {}) {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    return this.request(url, {
      ...options,
      method: 'POST',
      body: bodyStr
    });
  }

  /**
   * PUT request
   */
  async put(url, body, options = {}) {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    return this.request(url, {
      ...options,
      method: 'PUT',
      body: bodyStr
    });
  }

  /**
   * DELETE request
   */
  async delete(url, options = {}) {
    return this.request(url, { ...options, method: 'DELETE' });
  }

  /**
   * Fetch con timeout
   */
  async _fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

const apiClient = new ApiClient();

export default apiClient;

/**
 * Helper para sincronización desde Service Worker
 * Envía una petición desde la cola
 */
export async function syncQueueRequest(queueItem) {
  const { method, url, headers, body } = queueItem;

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      cache: 'no-store'
    });

    return {
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      data: response.ok ? await response.json().catch(() => null) : null,
      error: !response.ok ? `HTTP ${response.status}` : null
    };
  } catch (error) {
    return {
      success: false,
      status: 0,
      error: error.message
    };
  }
}

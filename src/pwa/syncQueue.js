/**
 * SyncQueue - Gestiona cola de peticiones offline para sincronizar cuando vuelva internet
 * Usa IndexedDB para persistencia
 */

const DB_NAME = 'tunja-sync-db';
const STORE_NAME = 'pending-requests';
const DB_VERSION = 1;

class SyncQueue {
  constructor() {
    this.db = null;
    this.listeners = new Set();
    this.initialized = false;
  }

  /**
   * Inicializa la base de datos IndexedDB
   */
  async init() {
    if (this.initialized) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Error opening SyncQueue DB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.initialized = true;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('status', 'status', { unique: false });
        }
      };
    });
  }

  /**
   * Agregar una petición a la cola
   */
  async add(request) {
    await this.init();

    const queueItem = {
      method: request.method || 'GET',
      url: request.url,
      body: request.body || null,
      headers: request.headers || {},
      timestamp: Date.now(),
      status: 'pending', // 'pending' | 'syncing' | 'failed'
      retries: 0,
      lastError: null,
      id: undefined // Se asigna automáticamente
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const addRequest = store.add(queueItem);

      addRequest.onsuccess = () => {
        const id = addRequest.result;
        queueItem.id = id;
        this._notifyListeners('item-added', { ...queueItem, id });
        resolve(queueItem);
      };

      addRequest.onerror = () => {
        console.error('Error adding to SyncQueue:', addRequest.error);
        reject(addRequest.error);
      };
    });
  }

  /**
   * Obtener todas las peticiones pendientes
   */
  async getAll() {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('status');
      const request = index.getAll('pending');

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        console.error('Error getting pending requests:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Obtener un item específico por ID
   */
  async getById(id) {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Actualizar estado de un item
   */
  async updateStatus(id, status, lastError = null) {
    await this.init();

    const item = await this.getById(id);
    if (!item) return null;

    item.status = status;
    item.lastError = lastError;

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(item);

      request.onsuccess = () => {
        this._notifyListeners('status-changed', { id, status, lastError });
        resolve(item);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Incrementar reintentos
   */
  async incrementRetries(id) {
    await this.init();

    const item = await this.getById(id);
    if (!item) return null;

    item.retries = (item.retries || 0) + 1;

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(item);

      request.onsuccess = () => {
        resolve(item);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Remover item de la cola
   */
  async remove(id) {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => {
        this._notifyListeners('item-removed', { id });
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Limpiar toda la cola
   */
  async clear() {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        this._notifyListeners('queue-cleared');
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Contar items pendientes
   */
  async count() {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('status');
      const request = index.count('pending');

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Agregar listener para cambios
   */
  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notificar cambios a los listeners
   */
  _notifyListeners(eventType, payload) {
    this.listeners.forEach((callback) => {
      try {
        callback({ type: eventType, payload });
      } catch (err) {
        console.error('Error in SyncQueue listener:', err);
      }
    });
  }
}

// Instancia singleton
const syncQueue = new SyncQueue();

export default syncQueue;

/**
 * syncHandler - Manejador de sincronización para Service Worker v3
 * Completo y testeable
 */

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 5000]; // ms
const SYNC_DB_NAME = 'tunja-sync';
const SYNC_STORE_NAME = 'pending-requests';

/**
 * Handler principal de sincronización
 * Llamado cuando vuelve la conexión o cuando se dispara TRIGGER_SYNC
 */
export async function handleSyncMessage(event) {
    try {
        const queue = await getSyncQueue();
        
        if (!queue || queue.length === 0) {
            return;
        }

        for (const item of queue) {
            let retryCount = 0;
            let success = false;

            while (retryCount < MAX_RETRIES && !success) {
                try {
                    const response = await sendRequest(item);
                    
                    if (response.success) {
                        // Éxito: eliminar de cola
                        await removeQueueItem(item.id);
                        success = true;
                        
                        // Notificar a clientes (evento sync completado)
                        await notifyClientsSync({
                            itemId: item.id,
                            status: 'completed',
                            url: item.url
                        });
                    } else {
                        throw new Error(`HTTP ${response.status}`);
                    }
                } catch (error) {
                    retryCount++;
                    
                    if (retryCount < MAX_RETRIES) {
                        // Esperar antes de reintentar (backoff exponencial)
                        await sleep(RETRY_DELAYS[retryCount - 1]);
                    } else {
                        // Falló después de reintentos
                        await updateQueueItemStatus(item.id, 'failed', error.message);
                        
                        // Notificar a clientes (sync falló)
                        await notifyClientsSync({
                            itemId: item.id,
                            status: 'failed',
                            url: item.url,
                            error: error.message
                        });
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error en handleSyncMessage:', error);
    }
}

/**
 * Obtener cola de peticiones pendientes
 */
async function getSyncQueue() {
    try {
        const db = await openSyncDb();
        
        return new Promise((resolve) => {
            const transaction = db.transaction([SYNC_STORE_NAME], 'readonly');
            const store = transaction.objectStore(SYNC_STORE_NAME);
            const index = store.index('status');
            const request = index.getAll('pending');

            request.onsuccess = () => {
                db.close();
                resolve(request.result || []);
            };

            request.onerror = () => {
                db.close();
                resolve([]);
            };
        });
    } catch (_error) {
        return [];
    }
}

/**
 * Actualizar estado de un item en la cola
 */
async function updateQueueItemStatus(id, status, error = null) {
    try {
        const db = await openSyncDb();
        
        return new Promise((resolve) => {
            const transaction = db.transaction([SYNC_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(SYNC_STORE_NAME);
            const getRequest = store.get(id);

            getRequest.onsuccess = () => {
                const item = getRequest.result;
                if (!item) {
                    db.close();
                    resolve(null);
                    return;
                }

                item.status = status;
                item.lastUpdated = Date.now();
                if (error) item.lastError = error;

                const putRequest = store.put(item);

                putRequest.onsuccess = () => {
                    db.close();
                    resolve(item);
                };

                putRequest.onerror = () => {
                    db.close();
                    resolve(null);
                };
            };
        });
    } catch (_error) {
        return null;
    }
}

/**
 * Remover item de la cola (éxito)
 */
async function removeQueueItem(id) {
    try {
        const db = await openSyncDb();
        
        return new Promise((resolve) => {
            const transaction = db.transaction([SYNC_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(SYNC_STORE_NAME);
            const request = store.delete(id);

            request.onsuccess = () => {
                db.close();
                resolve(true);
            };

            request.onerror = () => {
                db.close();
                resolve(false);
            };
        });
    } catch (_error) {
        return false;
    }
}

/**
 * Enviar petición HTTP
 */
async function sendRequest(item) {
    const response = await fetch(item.url, {
        method: item.method || 'POST',
        headers: item.headers || {},
        body: item.body,
        cache: 'no-store'
    });

    return {
        success: response.ok,
        status: response.status,
        statusText: response.statusText
    };
}

/**
 * Notificar a clientes sobre resultado de sync
 */
async function notifyClientsSync(data) {
    try {
        const clients = await self.clients.matchAll();
        for (const client of clients) {
            client.postMessage({
                type: 'SYNC_RESULT',
                payload: data
            });
        }
    } catch (_error) {
        // Ignorar si no hay clientes
    }
}

/**
 * Abrir IndexedDB para sync
 */
function openSyncDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(SYNC_DB_NAME, 1);

        request.onerror = () => reject(request.error);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            if (!db.objectStoreNames.contains(SYNC_STORE_NAME)) {
                const store = db.createObjectStore(SYNC_STORE_NAME, { keyPath: 'id' });
                store.createIndex('status', 'status', { unique: false });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };

        request.onsuccess = () => resolve(request.result);
    });
}

/**
 * Sleep utility para reintentos
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

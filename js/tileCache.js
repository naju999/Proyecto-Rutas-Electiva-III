/**
 * tileCache.js
 * Sistema de caché con IndexedDB para tiles del mapa
 */

class TileCache {
    constructor(dbName = 'tunjaMapsCache', storeName = 'tiles') {
        this.dbName = dbName;
        this.storeName = storeName;
        this.db = null;
        this.isOnline = navigator.onLine;
        this.cachedTiles = new Set();
        this.MAX_TILES = 2000;  // Máximo número de tiles (no MB)
        this.init();
    }
    
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            
            request.onerror = () => {
                console.error('❌ Error al abrir IndexedDB:', request.error);
                reject(request.error);
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                console.log('✅ IndexedDB inicializado correctamente');
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'url' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('layer', 'layer', { unique: false });
                    console.log('📦 ObjectStore creado:', this.storeName);
                }
            };
        });
    }
    
    // Guardar tile como Blob con control de tamaño máximo
    async saveTile(url, blob, layer = 'default') {
        if (!this.db) await this.init();
        
        // Validar que sea un blob válido ANTES de intentar guardar
        if (!blob || !(blob instanceof Blob)) {
            console.error(`❌ Blob inválido para guardar: tipo=${typeof blob}`);
            throw new Error(`Invalid blob: must be a Blob instance`);
        }
        
        if (blob.size === 0) {
            console.error(`❌ Blob vacío: ${url}`);
            throw new Error(`Invalid blob: size must be > 0`);
        }
        
        // Limitar tamaño individual de tile a 500KB (máximo razonable)
        if (blob.size > 500 * 1024) {
            console.warn(`⚠️ Tile demasiado grande (${(blob.size/1024).toFixed(1)}KB): ${url}`);
        }
        
        // Extraer información de zoom del URL
        const urlMatch = url.match(/\/(\d+)\/(\d+)\/(\d+)\./);
        const zoomLevel = urlMatch ? parseInt(urlMatch[1]) : 0;
        
        return new Promise((resolve, reject) => {
            // Crear objeto de tile optimizado
            const tileData = {
                url: url,
                data: blob,
                timestamp: Date.now(),
                layer: layer,
                zoomLevel: zoomLevel,
                size: blob.size,
                contentType: blob.type
            };
            
            // Transacción de escritura - simples y eficiente
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(tileData);  // put = insert or update
            
            request.onsuccess = () => {
                this.cachedTiles.add(url);
                
                const coordsFromUrl = url.match(/(\d+)\/(\d+)\/(\d+)/);
                const coords = coordsFromUrl ? `${coordsFromUrl[1]}/${coordsFromUrl[2]}/${coordsFromUrl[3]}` : 'unknown';
                console.log(`💾 Tile Z${zoomLevel} (${(blob.size/1024).toFixed(1)}KB):`, coords);
                
                // Verificar si hemos excedido límite de tiles
                this.getAllTiles().then(allTiles => {
                    if (allTiles.length > this.MAX_TILES) {
                        console.log(`⚠️ Límite de tiles alcanzado (${allTiles.length} > ${this.MAX_TILES}). Limpiando...`);
                        this.cleanOldestTiles();
                    }
                }).catch(e => {
                    console.warn(`⚠️ Error verificando límite de caché:`, e.message);
                });
                
                resolve(tileData);
            };
            
            request.onerror = () => {
                console.error('❌ Error guardar tile:', request.error);
                reject(request.error);
            };
            
            transaction.onerror = () => {
                console.error('❌ Error en transacción de guardado:', transaction.error);
                reject(transaction.error);
            };
        });
    }
    
    async getTile(url) {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(url);
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                console.error('❌ Error al obtener tile:', request.error);
                reject(request.error);
            };
        });
    }
    
    async getAllTiles() {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }
    
    async clearCache() {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();
            
            request.onsuccess = () => {
                this.cachedTiles.clear();
                console.log('🗑️ Caché limpiado');
                resolve();
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }
    
    async getCacheSize() {
        const tiles = await this.getAllTiles();
        let size = 0;
        tiles.forEach(tile => {
            if (tile.data instanceof Blob) {
                size += tile.data.size;
            }
        });
        return {
            count: tiles.length,
            sizeInMB: (size / (1024 * 1024)).toFixed(2)
        };
    }
    
    /**
     * Limpiar tiles más antiguos cuando se alcanza el límite
     * Elimina los 30% más antiguos
     */
    async cleanOldestTiles() {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('timestamp');
            const request = index.getAll();
            
            request.onsuccess = () => {
                const allTiles = request.result;
                // Eliminar los 30% más antiguos
                const toDelete = Math.ceil(allTiles.length * 0.3);
                
                if (toDelete === 0) {
                    resolve();
                    return;
                }
                
                const tilesOldest = allTiles.slice(0, toDelete);
                
                // Transacción de escritura para borrar
                const deleteTransaction = this.db.transaction([this.storeName], 'readwrite');
                const deleteStore = deleteTransaction.objectStore(this.storeName);
                
                tilesOldest.forEach(tile => {
                    deleteStore.delete(tile.url);
                    this.cachedTiles.delete(tile.url);
                });
                
                deleteTransaction.oncomplete = () => {
                    console.log(`✅ Liberados ${toDelete} tiles antiguos (${allTiles.length - toDelete} tiles restantes)`);
                    resolve();
                };
                
                deleteTransaction.onerror = () => {
                    console.error('❌ Error limpiando tiles:', deleteTransaction.error);
                    reject(deleteTransaction.error);
                };
            };
            
            request.onerror = () => {
                console.error('❌ Error listando tiles para limpiar:', request.error);
                reject(request.error);
            };
        });
    }
}

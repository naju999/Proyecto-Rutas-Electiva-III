/**
 * mapLayers.js
 * Clase CachedTileLayer y configuración de capas del mapa
 */

/**
 * Clase que extiende L.TileLayer para agregar funcionalidad de caché
 * Corregida para mantener URLs consistentes y cachear correctamente
 */
class CachedTileLayer extends L.TileLayer {
    // Obtener el URL del tile de forma consistente
    getTileUrlConsistent(coords) {
        // Usa la implementación de L.TileLayer pero también aplica funciones personalizadas
        let url = this.getTileUrl(coords);
        return url;
    }
    
    createTile(coords, done) {
        const layerName = this.options.name || 'default';
        const tileUrl = this.getTileUrlConsistent(coords);  // URL consistente para caché
        const tile = document.createElement('img');
        const that = this;
        let isHandled = false;

        tile.alt = '';
        tile.role = 'presentation';
        
        const completeCallback = function(error) {
            if (isHandled) return;
            isHandled = true;
            
            if (error) {
                done(error);
            } else {
                done(null, tile);
            }
        };
        
        // Modo offline: cargar del caché PRIMERO
        if (MAP_STATE.offlineMode) {
            loadTileFromCache();
        } else {
            // Modo online: descargar y cachear simultáneamente
            loadTileOnlineAndCache();
        }
        
        /**
         * Carga el tile desde el caché
         */
        async function loadTileFromCache() {
            try {
                // Buscar el tile en el caché con URL exacto
                let cachedTile = await tileCache.getTile(tileUrl);
                
                if (cachedTile && cachedTile.data instanceof Blob) {
                    console.log(`✅ Del caché [${layerName} Z${coords.z}]:`, tileUrl.split('/').slice(-3).join('/'));

                    // Registrar handlers ANTES de asignar src para evitar carreras con blobs rápidos.
                    const timeoutId = setTimeout(() => {
                        if (!isHandled) {
                            console.warn(`⏱️ Timeout offline (aceptado):`, tileUrl.split('/').slice(-3).join('/'));
                            completeCallback(null);
                        }
                    }, 1500);
                    
                    tile.onload = function() {
                        clearTimeout(timeoutId);
                        if (tile.dataset.blobUrl) {
                            URL.revokeObjectURL(tile.dataset.blobUrl);
                            delete tile.dataset.blobUrl;
                        }
                        completeCallback(null);
                    };
                    
                    tile.onerror = function() {
                        clearTimeout(timeoutId);
                        // Si falla el blob URL, intentar recargar del caché nuevamente
                        console.warn(`⚠️ Tile cacheado no se renderizó, reintentando...`);
                        const retryUrl = URL.createObjectURL(cachedTile.data);
                        tile.dataset.blobUrl = retryUrl;
                        tile.src = retryUrl;
                        setTimeout(() => {
                            if (!isHandled) completeCallback(null);
                        }, 1000);
                    };

                    const blobUrl = URL.createObjectURL(cachedTile.data);
                    tile.dataset.blobUrl = blobUrl;
                    tile.src = blobUrl;
                } else {
                    // Tile no está en caché
                    console.warn(`❌ NO en caché [${layerName} Z${coords.z}]:`, tileUrl.split('/').slice(-3).join('/'));
                    const placeholderSvg = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="256" height="256"%3E%3Crect fill="%23ffe0e0" width="256" height="256" opacity="0.3"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23cc0000" font-size="11" font-weight="bold"%3ENo caché%3C/text%3E%3C/svg%3E';
                    tile.src = placeholderSvg;
                    tile.title = 'Tile no está cacheado';
                    setTimeout(() => {
                        if (!isHandled) completeCallback(null);
                    }, 100);
                }
            } catch (e) {
                console.error(`❌ Error IndexedDB [${layerName}]:`, e.message);
                const errorSvg = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="256" height="256"%3E%3Crect fill="%23f0f0f0" width="256" height="256"/%3E%3C/svg%3E';
                tile.src = errorSvg;
                setTimeout(() => {
                    if (!isHandled) completeCallback(null);
                }, 100);
            }
        }
        
        /**
         * Carga el tile online y lo cachea en background
         */
        function loadTileOnlineAndCache() {
            tile.onload = function() {
                // Iniciar caché SIN bloquear
                setTimeout(async () => {
                    await cacheImageFromUrl(tileUrl, layerName, coords.z, 0);
                }, 50);
                completeCallback(null);
            };
            
            tile.onerror = function() {
                console.warn(`❌ Error descargando [${layerName} Z${coords.z}]:`, tileUrl.split('/').slice(-3).join('/'));
                // Evitar que la capa quede en estado de carga infinita.
                const errorSvg = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="256" height="256"%3E%3Crect fill="%23f0f0f0" width="256" height="256"/%3E%3C/svg%3E';
                tile.src = errorSvg;
                completeCallback(null);
            };
            
            tile.src = tileUrl;
        }
        
        /**
         * Cachea la imagen CON reintentos automáticos
         */
        async function cacheImageFromUrl(url, layer, zoomLevel, retryCount = 0) {
            const MAX_RETRIES = 2;
            
            try {
                const response = await fetch(url, {
                    // Timeout AUMENTADO a 15 segundos
                    signal: AbortSignal.timeout(15000)
                });
                
                if (!response.ok) {
                    console.warn(`⚠️ HTTP ${response.status}: No se cachea`);
                    return;
                }
                
                const blob = await response.blob();
                
                if (!blob || blob.size === 0) {
                    console.warn(`⚠️ Blob vacío`);
                    return;
                }
                
                await tileCache.saveTile(url, blob, layer);
                if (typeof scheduleCacheInfoUpdate === 'function') {
                    scheduleCacheInfoUpdate(1200);
                } else {
                    updateCacheInfo();
                }
                
            } catch (e) {
                if (e.name === 'AbortError') {
                    if (retryCount < MAX_RETRIES) {
                        console.log(`🔄 Reintentando caché...`);
                        await new Promise(r => setTimeout(r, 1000));
                        await cacheImageFromUrl(url, layer, zoomLevel, retryCount + 1);
                    } else {
                        console.warn(`⏱️  Timeout después de ${MAX_RETRIES} reintentos`);
                    }
                } else if (e.message.includes('Failed to fetch')) {
                    if (retryCount < MAX_RETRIES) {
                        console.log(`🔄 Reintentando (error red)...`);
                        await new Promise(r => setTimeout(r, 2000));
                        await cacheImageFromUrl(url, layer, zoomLevel, retryCount + 1);
                    }
                } else {
                    console.warn(`⚠️ Error caché:`, e.message);
                }
            }
        }
        
        return tile;
    }
}

/**
 * Inicializa todas las capas del mapa
 */
function initializeLayers() {
    // Capa OpenStreetMap (por defecto) - CON CACHÉ
    MAP_STATE.layers.openstreetmap = new CachedTileLayer(MAP_CONFIG.layers.openstreetmap.url, {
        attribution: MAP_CONFIG.layers.openstreetmap.attribution,
        maxZoom: MAP_CONFIG.maxZoom,
        minZoom: MAP_CONFIG.minZoom,
        name: 'openstreetmap'
    }).addTo(MAP_STATE.map);
    
    // Capa Satélite - CON CACHÉ
    MAP_STATE.layers.satellite = new CachedTileLayer(MAP_CONFIG.layers.satellite.url, {
        attribution: MAP_CONFIG.layers.satellite.attribution,
        maxZoom: MAP_CONFIG.maxZoom,
        minZoom: MAP_CONFIG.minZoom,
        name: 'satellite'
    });
    
    // Capa Terreno - CON CACHÉ
    MAP_STATE.layers.terrain = new CachedTileLayer(MAP_CONFIG.layers.terrain.url, {
        attribution: MAP_CONFIG.layers.terrain.attribution,
        maxZoom: MAP_CONFIG.maxZoom,
        minZoom: MAP_CONFIG.minZoom,
        name: 'terrain'
    });
}

/**
 * Agrega el marcador principal y puntos de interés
 */
function addMarkersAndFeatures() {
    // Agregar marcador principal en el centro de Tunja
    let marcador = L.marker(MAP_CONFIG.center).addTo(MAP_STATE.map);
    marcador.bindPopup(`
        <div class="popup-title">Tunja, Boyacá</div>
        <p>Capital del departamento de Boyacá</p>
        <p><strong>Latitud:</strong> 5.5277°N</p>
        <p><strong>Longitud:</strong> 73.3639°O</p>
    `).openPopup();
    
    // Agregar un círculo alrededor del punto central
    L.circle(MAP_CONFIG.center, {
        color: '#667eea',
        fillColor: '#667eea',
        fillOpacity: 0.1,
        radius: 3000, // 3 km
        weight: 2
    }).addTo(MAP_STATE.map);
    
    // Agregar marcadores de puntos de interés
    MAP_CONFIG.pointsOfInterest.forEach(punto => {
        let marcadorInteres = L.circleMarker(punto.coords, {
            radius: 8,
            fillColor: '#0066cc',
            color: '#003d99',
            weight: 2,
            opacity: 0.8,
            fillOpacity: 0.7
        }).addTo(MAP_STATE.map);
        
        marcadorInteres.bindPopup(`
            <div class="popup-title">${punto.nombre}</div>
            <p>${punto.descripcion}</p>
        `);
    });
}

/**
 * Obtiene geometria de ruta siguiendo calles usando OSRM.
 * Si falla, devuelve el trazado simple por paradas.
 * @param {Array<{lat:number,lng:number}>} stops
 * @returns {Promise<Array<[number, number]>>}
 */
async function getRoadAwarePath(stops) {
    const fallbackPath = stops.map(stop => [stop.lat, stop.lng]);

    try {
        const waypoints = stops
            .map(stop => `${stop.lng},${stop.lat}`)
            .join(';');

        const url = `https://router.project-osrm.org/route/v1/driving/${waypoints}?overview=full&geometries=geojson&steps=false&continue_straight=true`;
        const response = await fetch(url, { signal: AbortSignal.timeout(12000) });

        if (!response.ok) {
            console.warn(`⚠️ No se pudo enrutar por calles (HTTP ${response.status}). Se usa trazado base.`);
            return fallbackPath;
        }

        const data = await response.json();
        const routeCoords = data?.routes?.[0]?.geometry?.coordinates;

        if (!Array.isArray(routeCoords) || routeCoords.length < 2) {
            console.warn('⚠️ Respuesta de enrutamiento sin geometria valida. Se usa trazado base.');
            return fallbackPath;
        }

        // OSRM retorna [lng, lat]. Leaflet usa [lat, lng].
        return routeCoords.map(([lng, lat]) => [lat, lng]);
    } catch (error) {
        console.warn('⚠️ Enrutamiento por calles no disponible. Se usa trazado base.', error.message);
        return fallbackPath;
    }
}

/**
 * Dibuja ruta y paradas del bus A1.
 */
async function addBusRoutes() {
    const routeA1 = MAP_CONFIG.busRoutes?.a1;

    if (!routeA1 || !Array.isArray(routeA1.stops) || routeA1.stops.length < 2) {
        console.warn('⚠️ Configuracion de ruta A1 no disponible o incompleta.');
        return;
    }

    const routeGroup = L.layerGroup().addTo(MAP_STATE.map);
    const sortedStops = [...routeA1.stops].sort((a, b) => a.order - b.order);
    const roadPath = await getRoadAwarePath(sortedStops);

    L.polyline(roadPath, {
        color: routeA1.color || '#ff6b00',
        weight: 5,
        opacity: 0.85,
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(routeGroup).bindPopup(`<strong>${routeA1.name}</strong>`);

    sortedStops.forEach(stop => {
        L.circleMarker([stop.lat, stop.lng], {
            radius: 6,
            color: '#a84300',
            weight: 2,
            fillColor: '#ff8a3d',
            fillOpacity: 0.95
        }).addTo(routeGroup).bindPopup(`<strong>${stop.name}</strong>`);
    });

    MAP_STATE.layers.busA1 = routeGroup;
    console.log(`🚌 Ruta ${routeA1.id} cargada con ${sortedStops.length} paradas.`);
}

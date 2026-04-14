/**
 * mapControls.js
 * Funciones de control del mapa (zoom, centrado, cambio de capas, etc.)
 */

/**
 * Centra el mapa en Tunja
 */
function centerMap() {
    MAP_STATE.map.flyTo(MAP_CONFIG.center, MAP_CONFIG.initialZoom);
}

/**
 * Aumenta el zoom del mapa
 */
function zoomIn() {
    MAP_STATE.map.zoomIn();
}

/**
 * Disminuye el zoom del mapa
 */
function zoomOut() {
    MAP_STATE.map.zoomOut();
}

/**
 * Resetea la vista del mapa al estado inicial
 */
function resetView() {
    MAP_STATE.map.setView(MAP_CONFIG.center, MAP_CONFIG.initialZoom);
}

/**
 * Cambia la capa del mapa
 * @param {string} layerName - Nombre de la capa a mostrar
 */
function changeMapLayer(layerName) {
    // Remover solo capas base para no afectar overlays (ej: ruta de bus).
    const baseLayers = ['openstreetmap', 'satellite', 'terrain'];
    baseLayers.forEach(baseLayerName => {
        const layer = MAP_STATE.layers[baseLayerName];
        if (layer && MAP_STATE.map.hasLayer(layer)) {
            MAP_STATE.map.removeLayer(layer);
        }
    });
    
    // Agregar la nueva capa
    if (MAP_STATE.layers[layerName]) {
        MAP_STATE.layers[layerName].addTo(MAP_STATE.map);
        MAP_STATE.currentLayer = layerName;
        console.log('📍 Capa cambiada a:', layerName);
    }
}

/**
 * Muestra u oculta la ruta A1 en el mapa
 * @param {boolean} visible
 */
function toggleBusRouteA1(visible) {
    const busLayer = MAP_STATE.layers.busA1;

    if (!busLayer) {
        console.warn('⚠️ La capa de la ruta A1 todavia no esta disponible.');
        return;
    }

    if (visible) {
        if (!MAP_STATE.map.hasLayer(busLayer)) {
            busLayer.addTo(MAP_STATE.map);
        }
    } else if (MAP_STATE.map.hasLayer(busLayer)) {
        MAP_STATE.map.removeLayer(busLayer);
    }
}

/**
 * Agrega controles básicos del mapa
 */
function addMapControls() {
    // Agregar control de zoom personalizado
    MAP_STATE.map.zoomControl.setPosition('topright');
    
    // Agregar escala
    L.control.scale().addTo(MAP_STATE.map);
}

/**
 * Actualiza el panel lateral de coordenadas
 * @param {number} lat
 * @param {number} lng
 */
function updateCoordinatesPanel(lat, lng) {
    const latEl = document.getElementById('coordLat');
    const lngEl = document.getElementById('coordLng');

    if (!latEl || !lngEl) return;

    latEl.textContent = Number(lat).toFixed(6);
    lngEl.textContent = Number(lng).toFixed(6);
}

/**
 * Configura los event listeners del mapa
 */
function setupMapEventListeners() {
    // Inicializar panel con el centro actual del mapa
    const center = MAP_STATE.map.getCenter();
    updateCoordinatesPanel(center.lat, center.lng);

    // Escuchar cambios en el mapa (zoom, movimiento) para mantener caché actualizado
    MAP_STATE.map.on('moveend', function() {
        // Pequeño delay para que terminen los caches más rápidos
        if (typeof scheduleCacheInfoUpdate === 'function') {
            scheduleCacheInfoUpdate(700);
        } else {
            setTimeout(() => updateCacheInfo(), 500);
        }
    });
    
    MAP_STATE.map.on('zoomend', function() {
        // Pequeño delay para que terminen los caches más rápidos
        if (typeof scheduleCacheInfoUpdate === 'function') {
            scheduleCacheInfoUpdate(700);
        } else {
            setTimeout(() => updateCacheInfo(), 500);
        }
    });

    // Capturar coordenadas con clic derecho en el mapa
    MAP_STATE.map.on('contextmenu', function(event) {
        updateCoordinatesPanel(event.latlng.lat, event.latlng.lng);
        console.log(`📌 Coordenadas capturadas: ${event.latlng.lat.toFixed(6)}, ${event.latlng.lng.toFixed(6)}`);
    });
    
    // Actualizar en segundo plano con menor frecuencia para evitar carga de IndexedDB.
    setInterval(() => {
        if (typeof scheduleCacheInfoUpdate === 'function') {
            scheduleCacheInfoUpdate(300);
        } else {
            updateCacheInfo();
        }
    }, 8000);
}

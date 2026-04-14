/**
 * cacheManager.js
 * Funciones para gestionar caché e modo offline
 */

let cacheInfoUpdateTimer = null;
let cacheInfoUpdateInProgress = false;
let lastCacheInfoUpdateTs = 0;

/**
 * Programa actualización de métricas de caché con debounce.
 */
function scheduleCacheInfoUpdate(delay = 700) {
    if (cacheInfoUpdateTimer) {
        clearTimeout(cacheInfoUpdateTimer);
    }

    cacheInfoUpdateTimer = setTimeout(() => {
        cacheInfoUpdateTimer = null;
        updateCacheInfo();
    }, delay);
}

/**
 * Obtener estadísticas detalladas del caché
 */
async function getCacheStatistics() {
    const tiles = await tileCache.getAllTiles();
    const stats = {
        total: tiles.length,
        byLayer: {},
        byZoom: {},
        totalSize: 0
    };
    
    tiles.forEach(tile => {
        // Por layer
        if (!stats.byLayer[tile.layer]) {
            stats.byLayer[tile.layer] = { count: 0, size: 0 };
        }
        stats.byLayer[tile.layer].count++;
        stats.byLayer[tile.layer].size += tile.size || 0;
        
        // Por zoom level
        const z = tile.zoomLevel || 0;
        if (!stats.byZoom[z]) {
            stats.byZoom[z] = { count: 0, size: 0 };
        }
        stats.byZoom[z].count++;
        stats.byZoom[z].size += tile.size || 0;
        
        stats.totalSize += tile.size || 0;
    });
    
    return stats;
}

/**
 * Actualizar UI del caché directamente desde IndexedDB (número REAL)
 */
async function updateCacheInfo() {
    if (cacheInfoUpdateInProgress) return;

    const now = Date.now();
    // Evita refrescos completos excesivos en ráfaga.
    if (now - lastCacheInfoUpdateTs < 500) return;

    cacheInfoUpdateInProgress = true;
    try {
        const tileCountEl = document.getElementById('tileCount');
        const cacheSizeEl = document.getElementById('cacheSize');
        if (!tileCountEl || !cacheSizeEl) {
            return;
        }

        const cacheInfo = await tileCache.getCacheSize();
        const stats = await getCacheStatistics();
        
        tileCountEl.textContent = cacheInfo.count;
        cacheSizeEl.textContent = cacheInfo.sizeInMB + ' MB';
        
        // Mostrar detalles por layer
        let layerDetails = '';
        Object.entries(stats.byLayer).forEach(([layer, info]) => {
            const layerSize = (info.size / (1024 * 1024)).toFixed(2);
            layerDetails += `<p style="margin: 3px 0; font-size: 0.85em;">📍 ${layer}: ${info.count} tiles (${layerSize} MB)</p>`;
        });
        
        // Mostrar detalles por zoom
        let zoomDetails = '';
        Object.entries(stats.byZoom).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).forEach(([zoom, info]) => {
            const zoomSize = (info.size / (1024 * 1024)).toFixed(2);
            zoomDetails += `<p style="margin: 3px 0; font-size: 0.85em;">🔍 Z${zoom}: ${info.count} tiles (${zoomSize} MB)</p>`;
        });
        
        // Actualizar tooltips si existen
        const layerDetailsDiv = document.getElementById('layerDetails');
        if (layerDetailsDiv) layerDetailsDiv.innerHTML = layerDetails;
        
        const zoomDetailsDiv = document.getElementById('zoomDetails');
        if (zoomDetailsDiv) zoomDetailsDiv.innerHTML = zoomDetails;
        
        console.log(`📊 Caché actualizado: ${cacheInfo.count} tiles, ${cacheInfo.sizeInMB} MB`);
    } catch (e) {
        console.error('Error actualizando caché:', e);
    } finally {
        lastCacheInfoUpdateTs = Date.now();
        cacheInfoUpdateInProgress = false;
    }
}

/**
 * Mostrar indicador de caché en progreso
 */
function showCachingIndicator() {
    const cacheSizeInfo = document.getElementById('cacheSizeInfo');
    if (cacheSizeInfo && !cacheSizeInfo.classList.contains('cacheando')) {
        cacheSizeInfo.style.borderLeft = '4px solid #ffc107';
        cacheSizeInfo.style.animation = 'pulse 1.5s infinite';
        cacheSizeInfo.classList.add('cacheando');
        console.log('⏳ Cacheando tiles...');
    }
}

/**
 * Ocultar indicador de caché
 */
function hideCachingIndicator() {
    const cacheSizeInfo = document.getElementById('cacheSizeInfo');
    if (cacheSizeInfo && cacheSizeInfo.classList.contains('cacheando')) {
        cacheSizeInfo.style.borderLeft = '0px';
        cacheSizeInfo.style.animation = 'none';
        cacheSizeInfo.classList.remove('cacheando');
        console.log('✅ Caché completado');
    }
}

/**
 * Toggle para activa/desactiva modo offline
 */
async function toggleOfflineMode() {
    MAP_STATE.offlineMode = !MAP_STATE.offlineMode;
    const btn = document.getElementById('offlineBtn');
    const statusDiv = document.getElementById('statusCacheo');
    const statusText = document.getElementById('statusText');

    if (!btn || !statusDiv || !statusText) {
        console.warn('No hay controles de cache visibles para cambiar modo offline.');
        return;
    }
    
    if (MAP_STATE.offlineMode) {
        btn.style.background = '#28a745';
        btn.textContent = '🔴 Modo Offline Activo';
        statusDiv.style.display = 'block';
        statusDiv.style.background = '#fff3cd';
        statusText.textContent = '⚠️ MODO OFFLINE - Tiles cacheados apenas';
        statusText.style.color = '#856404';
        
        const cacheInfo = await tileCache.getCacheSize();
        const stats = await getCacheStatistics();
        
        if (cacheInfo.count === 0) {
            alert('⚠️ No hay tiles cacheados todavía.\n\nPor favor:\n1. Navega por el mapa en modo ONLINE\n2. Desplázate y zoom para cachear tiles de diferentes zoom levels\n3. Espera a que los tiles se carguen y cacheen (verás "💾 Tile cacheado" en la consola)\n4. Luego podrás usar el MODO OFFLINE\n\nℹ️ Zoom levels cacheados actualmente: NINGUNO');
            MAP_STATE.offlineMode = false;
            btn.style.background = '#ffc107';
            btn.textContent = '🌐 Simular Offline';
            statusDiv.style.display = 'none';
        } else {
            // Crear resumen detallado de qué está cacheado
            let detailedSummary = `✅ MODO OFFLINE ACTIVADO\n\n`;
            detailedSummary += `📊 CACHÉ DISPONIBLE:\n`;
            detailedSummary += `Total: ${cacheInfo.count} tiles (${cacheInfo.sizeInMB} MB)\n\n`;
            
            detailedSummary += `📍 Por capa:\n`;
            Object.entries(stats.byLayer).forEach(([layer, info]) => {
                const layerSize = (info.size / (1024 * 1024)).toFixed(2);
                detailedSummary += `  • ${layer}: ${info.count} tiles (${layerSize} MB)\n`;
            });
            
            detailedSummary += `\n🔍 Zoom levels cacheados:\n`;
            const zoomLevels = Object.keys(stats.byZoom)
                .map(z => parseInt(z))
                .sort((a, b) => a - b);
            zoomLevels.forEach(z => {
                const info = stats.byZoom[z];
                const zoomSize = (info.size / (1024 * 1024)).toFixed(2);
                detailedSummary += `  • Z${z}: ${info.count} tiles (${zoomSize} MB)\n`;
            });
            
            detailedSummary += `\n💡 En modo offline solo se mostrarán los tiles cacheados.`;
            detailedSummary += `\n   Si ves áreas rojas, significa que esos tiles no estaban cacheados.`;
            
            console.log(detailedSummary + '\n------');
            
            // Log mejorado en consola
            console.log('✅ MODO OFFLINE ACTIVADO');
            console.log(`📊 Total: ${cacheInfo.count} tiles (${cacheInfo.sizeInMB} MB)`);
            console.log(`📍 Por capa:`, stats.byLayer);
            console.log(`🔍 Zoom levels:`, zoomLevels);
            
            // Refrescar el mapa para cargar tiles del caché
            console.log('🔄 Recargando tiles desde caché...');
            MAP_STATE.map.eachLayer(layer => {
                if (layer.redraw) layer.redraw();
            });
            setTimeout(() => {
                MAP_STATE.map.invalidateSize(false);
            }, 100);
        }
    } else {
        btn.style.background = '#ffc107';
        btn.textContent = '🌐 Simular Offline';
        statusDiv.style.display = 'none';
        statusText.textContent = '🟢 Online';
        statusText.style.color = '#155724';
        
        console.log('✅ Modo ONLINE activado');
        console.log('   Los tiles se descargarán nuevamente desde el servidor');
        console.log('   Los tiles se cachearon en background automáticamente');
        
        // Refrescar el mapa para cargar desde internet
        MAP_STATE.map.eachLayer(layer => {
            if (layer.redraw) layer.redraw();
        });
        setTimeout(() => {
            MAP_STATE.map.invalidateSize(false);
        }, 100);
    }
}

/**
 * Limpiar caché completamente
 */
async function clearCache() {
    const stats = await getCacheStatistics();
    const msg = `¿Estás seguro de que deseas limpiar todo el caché?\n\n` +
                `📊 Se eliminarán:\n` +
                `• ${stats.total} tiles cacheados\n` +
                `• ${(stats.totalSize / (1024 * 1024)).toFixed(2)} MB de datos\n\n` +
                `Esta acción no se puede deshacer.`;
    
    if (confirm(msg)) {
        await tileCache.clearCache();
        MAP_STATE.memoryCacheList.length = 0;
        scheduleCacheInfoUpdate(100);
        alert('✅ Caché limpiado correctamente');
        MAP_STATE.map.invalidateSize();
    }
}

/**
 * Simular cambios en estado de conexión (para detectar cuando se va online/offline)
 */
function setupNetworkListeners() {
    window.addEventListener('online', function() {
        MAP_STATE.offlineMode = false;
        const offlineBtn = document.getElementById('offlineBtn');
        const statusCacheo = document.getElementById('statusCacheo');
        if (offlineBtn) {
            offlineBtn.style.background = '#ffc107';
            offlineBtn.textContent = '🌐 Simular Offline';
        }
        if (statusCacheo) {
            statusCacheo.style.display = 'none';
        }
        alert('✅ Conexión restaurada');
    });
    
    window.addEventListener('offline', function() {
        MAP_STATE.offlineMode = true;
        const offlineBtn = document.getElementById('offlineBtn');
        const statusCacheo = document.getElementById('statusCacheo');
        if (offlineBtn) {
            offlineBtn.style.background = '#28a745';
            offlineBtn.textContent = '🔴 Offline';
        }
        if (statusCacheo) {
            statusCacheo.style.display = 'block';
        }
    });
}

/**
 * Inicializa el sistema de caché
 */
function initializeCacheSystem() {
    setTimeout(() => {
        scheduleCacheInfoUpdate(50);
        console.log('🚀 Sistema de caché inicializado');
        console.log('📍 Navega por el mapa y haz zoom para comenzar a cachear');
        console.log('💡 Diferentes zoom levels = tiles diferentes = caché separado');
    }, 1000);
}

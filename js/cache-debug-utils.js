/**
 * cache-debug.js
 * Utilities para diagnosticar problemas de caché
 * Use: Pegar el contenido en la consola del navegador (F12)
 */

// 🔍 DIAGNÓSTICO COMPLETO DEL SISTEMA DE CACHÉ
async function cacheDiagnostics() {
    console.clear();
    console.log('%c🔍 DIAGNÓSTICO DEL SISTEMA DE CACHÉ', 'font-size: 18px; font-weight: bold; color: #0066cc;');
    console.log('═════════════════════════════════════════════════════════\n');
    
    try {
        // 1. ESTADO GENERAL
        console.log('%c1️⃣ ESTADO GENERAL', 'font-size: 14px; font-weight: bold; color: #0066cc;');
        console.log('Modo actual:', MAP_STATE.offlineMode ? '🔴 OFFLINE' : '🟢 ONLINE');
        console.log('Navigator.onLine:', navigator.onLine ? '✅ ONLINE' : '❌ OFFLINE');
        console.log('Cache disponible:', typeof tileCache !== 'undefined' ? '✅ Sí' : '❌ No');
        
        if (!tileCache || !tileCache.db) {
            console.warn('⚠️  TileCache no está inicializado. Esperando...');
            await tileCache.init();
        }
        console.log('\n');
        
        // 2. ESTADÍSTICAS DE CACHÉ
        console.log('%c2️⃣ ESTADÍSTICAS DE CACHÉ', 'font-size: 14px; font-weight: bold; color: #00aa00;');
        const cacheInfo = await tileCache.getCacheSize();
        const stats = await getCacheStatistics();
        
        console.log(`📊 Total de tiles: ${cacheInfo.count}`);
        console.log(`📦 Tamaño total: ${cacheInfo.sizeInMB} MB`);
        console.log('\n');
        
        // 3. TILES POR CAPA
        console.log('%c3️⃣ TILES POR CAPA', 'font-size: 14px; font-weight: bold; color: #ff6600;');
        if (Object.keys(stats.byLayer).length === 0) {
            console.warn('❌ No hay tiles en caché');
        } else {
            Object.entries(stats.byLayer).forEach(([layer, info]) => {
                const layerSize = (info.size / (1024 * 1024)).toFixed(2);
                const percentage = ((info.count / cacheInfo.count) * 100).toFixed(1);
                console.log(`  📍 ${layer.padEnd(20)}: ${String(info.count).padStart(4)} tiles (${String(layerSize).padStart(6)} MB) [${percentage}%]`);
            });
        }
        console.log('\n');
        
        // 4. TILES POR ZOOM LEVEL
        console.log('%c4️⃣ TILES POR ZOOM LEVEL', 'font-size: 14px; font-weight: bold; color: #ff0000;');
        if (Object.keys(stats.byZoom).length === 0) {
            console.warn('❌ No hay información de zoom levels');
        } else {
            const zoomLevels = Object.keys(stats.byZoom)
                .map(z => parseInt(z))
                .sort((a, b) => a - b);
            
            zoomLevels.forEach(z => {
                const info = stats.byZoom[z];
                const zoomSize = (info.size / (1024 * 1024)).toFixed(2);
                const barLength = Math.round(info.count / Math.max(...Object.values(stats.byZoom).map(x => x.count)) * 20);
                const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);
                console.log(`  🔍 Z${String(z).padEnd(2)}: ${String(info.count).padStart(4)} tiles [${bar}] ${String(zoomSize).padStart(6)} MB`);
            });
        }
        console.log('\n');
        
        // 5. CAPAS DEL MAPA ACTUAL
        console.log('%c5️⃣ CAPAS DEL MAPA ACTUAL', 'font-size: 14px; font-weight: bold; color: #6600cc;');
        const mapLayers = Object.entries(MAP_STATE.layers);
        if (mapLayers.length === 0) {
            console.warn('❌ No hay capas cargadas en el mapa');
        } else {
            mapLayers.forEach(([name, layer]) => {
                const isVisible = MAP_STATE.map.hasLayer(layer);
                const status = isVisible ? '✅ Visible' : '⚪ Oculta';
                console.log(`  📌 ${name.padEnd(20)}: ${status}`);
            });
        }
        console.log('\n');
        
        // 6. INFORMACIÓN DE LA CAPA ACTUAL
        console.log('%c6️⃣ CAPA ACTUAL', 'font-size: 14px; font-weight: bold; color: #cc0066;');
        const currentLayer = MAP_STATE.layers[MAP_STATE.currentLayer];
        if (currentLayer) {
            console.log(`  Capa: ${MAP_STATE.currentLayer}`);
            console.log(`  Zoom actual: ${MAP_STATE.map.getZoom()}`);
            console.log(`  Centro: [${MAP_STATE.map.getCenter().lat.toFixed(4)}, ${MAP_STATE.map.getCenter().lng.toFixed(4)}]`);
            console.log(`  Bounds: ${MAP_STATE.map.getBounds().toString().substring(0, 60)}...`);
        }
        console.log('\n');
        
        // 7. RECOMENDACIONES
        console.log('%c7️⃣ RECOMENDACIONES', 'font-size: 14px; font-weight: bold; color: #000000; background: #ffffcc;');
        if (cacheInfo.count === 0) {
            console.log('   ⚠️  No hay tiles cacheados.');
            console.log('   → Cambia a modo ONLINE y navega el mapa');
            console.log('   → Cambia zoom para cachear diferentes niveles');
            console.log('   → Espera a que se carguen los tiles');
        } else if (cacheInfo.count < 100) {
            console.log('   ℹ️  Hay pocos tiles cacheados.');
            console.log('   → Aumenta la cobertura navegando más por el mapa');
            console.log('   → Prueba diferentes zoom levels');
        } else if (cacheInfo.sizeInMB > 500) {
            console.log('   ℹ️  El caché es bastante grande.');
            console.log('   → Usa "clearCache()" si necesitas liberar espacio');
        } else {
            console.log('   ✅ Sistema de caché funcionando correctamente');
            console.log('   → Puedes cambiar a modo OFFLINE ahora');
        }
        console.log('\n═════════════════════════════════════════════════════════\n');
        
    } catch (error) {
        console.error('❌ Error durante diagnóstico:', error);
        console.error(error.stack);
    }
}

// 📋 VER TODOS LOS TILES CACHEADOS (en tabla)
async function showCachedTiles() {
    try {
        const tiles = await tileCache.getAllTiles();
        
        if (tiles.length === 0) {
            console.log('❌ No hay tiles cacheados');
            return;
        }
        
        console.clear();
        console.log(`%c📋 ${tiles.length} TILES CACHEADOS`, 'font-size: 16px; font-weight: bold;');
        
        // Preparar datos para tabla
        const tableData = tiles.map(tile => ({
            'Layer': tile.layer,
            'Zoom': tile.zoomLevel,
            'Coordenadas': tile.url.match(/(\d+)\/(\d+)\/(\d+)/) ? tile.url.match(/(\d+)\/(\d+)\/(\d+)/)[0] : 'N/A',
            'Tamaño (KB)': (tile.size / 1024).toFixed(1),
            'URL': tile.url.split('/').slice(-3).join('/')
        }));
        
        console.table(tableData);
        
        // Agrupar por zoom
        console.log('%c📊 RESUMEN POR ZOOM', 'font-size: 14px; font-weight: bold;');
        const byZoom = {};
        tiles.forEach(tile => {
            const z = tile.zoomLevel;
            byZoom[z] = (byZoom[z] || 0) + 1;
        });
        Object.entries(byZoom)
            .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
            .forEach(([z, count]) => {
                console.log(`  Z${z}: ${count} tiles`);
            });
            
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

// 🧹 LIMPIAR CACHÉ
async function wipeCacheForReal() {
    if (confirm('⚠️  ¿Estás COMPLETAMENTE SEGURO?\n\nEsto eliminará TODOS los tiles cacheados.\nEsta acción NO se puede deshacer.')) {
        try {
            await tileCache.clearCache();
            console.log('✅ Caché completamente limpiado');
            location.reload();
        } catch (error) {
            console.error('❌ Error al limpiar:', error);
        }
    } else {
        console.log('❌ Operación cancelada');
    }
}

// 🔄 RECARGAR TILES DEL CACHÉ
async function reloadCachedTiles() {
    try {
        console.log('🔄 Recargando tiles del caché...');
        MAP_STATE.map.eachLayer(layer => {
            if (layer.redraw) layer.redraw();
        });
        MAP_STATE.map.invalidateSize(false);
        console.log('✅ Tiles recargados');
    } catch (error) {
        console.error('❌ Error al recargar:', error);
    }
}

// 💾 EXPORTAR INFORMACIÓN DEL CACHÉ (como JSON)
async function exportCacheInfo() {
    try {
        const tiles = await tileCache.getAllTiles();
        const stats = await getCacheStatistics();
        
        const data = {
            timestamp: new Date().toISOString(),
            summary: {
                totalTiles: tiles.length,
                totalSizeMB: (stats.totalSize / (1024 * 1024)).toFixed(2),
                byLayer: stats.byLayer,
                byZoom: stats.byZoom
            },
            tiles: tiles.map(t => ({
                layer: t.layer,
                zoom: t.zoomLevel,
                url: t.url,
                size: t.size,
                timestamp: t.timestamp
            }))
        };
        
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cache-export-${Date.now()}.json`;
        a.click();
        
        console.log('✅ Información del caché exportada a JSON');
    } catch (error) {
        console.error('❌ Error al exportar:', error);
    }
}

// 📊 ESTADÍSTICAS DETALLADAS
async function detailedStats() {
    try {
        const tiles = await tileCache.getAllTiles();
        const stats = await getCacheStatistics();
        
        console.clear();
        console.log('%c📊 ESTADÍSTICAS DETALLADAS DEL CACHÉ', 'font-size: 16px; font-weight: bold; color: #0066cc;');
        console.log('\n%c▸ TAMAÑOS POR LAYER', 'font-size: 12px; font-weight: bold;');
        
        Object.entries(stats.byLayer).forEach(([layer, info]) => {
            const sizePerTile = (info.size / info.count / 1024).toFixed(1);
            console.log(`  ${layer.padEnd(20)}: ${info.count} tiles × ${sizePerTile} KB/tile = ${(info.size / (1024 * 1024)).toFixed(2)} MB`);
        });
        
        console.log('\n%c▸ ZOOM LEVELS', 'font-size: 12px; font-weight: bold;');
        Object.entries(stats.byZoom)
            .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
            .forEach(([zoom, info]) => {
                const sizePerTile = (info.size / info.count / 1024).toFixed(1);
                console.log(`  Z${zoom.padEnd(2)}: ${info.count} tiles × ${sizePerTile} KB/tile = ${(info.size / (1024 * 1024)).toFixed(2)} MB`);
            });
        
        console.log('\n%c▸ TILES MÁXIMOS POR LAYER', 'font-size: 12px; font-weight: bold;');
        Object.entries(stats.byLayer).forEach(([layer, info]) => {
            const maxZoom = Math.max(...tiles
                .filter(t => t.layer === layer)
                .map(t => t.zoomLevel));
            const minZoom = Math.min(...tiles
                .filter(t => t.layer === layer)
                .map(t => t.zoomLevel));
            console.log(`  ${layer.padEnd(20)}: Z${minZoom} - Z${maxZoom}`);
        });
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

// 🎯 RESUMEN RÁPIDO
async function summary() {
    const cacheInfo = await tileCache.getCacheSize();
    const stats = await getCacheStatistics();
    console.clear();
    console.log('%c✅ RESUMEN RÁPIDO', 'font-size: 16px; font-weight: bold; background: #ccffcc; padding: 5px;');
    console.log(`📊 ${cacheInfo.count} tiles cacheados (${cacheInfo.sizeInMB} MB)`);
    console.log(`📍 Layers:`, Object.keys(stats.byLayer).join(', '));
    console.log(`🔍 Zoom levels:`, Object.keys(stats.byZoom).sort((a, b) => a - b).join(', '));
}

// AYUDA
function cacheHelp() {
    console.clear();
    console.log('%c🆘 COMANDOS DE DIAGNÓSTICO DE CACHÉ', 'font-size: 16px; font-weight: bold; color: #0066cc;');
    console.log('\n%c📋 INFORMACIÓN', 'font-size: 12px; font-weight: bold;');
    console.log('  cacheDiagnostics()     → Diagnóstico completo del sistema');
    console.log('  summary()              → Resumen rápido');
    console.log('  showCachedTiles()      → Ver todos los tiles en tabla');
    console.log('  detailedStats()        → Estadísticas detalladas');
    console.log('\n%c🔄 ACCIONES', 'font-size: 12px; font-weight: bold;');
    console.log('  reloadCachedTiles()    → Recargar tiles del caché');
    console.log('  toggleOfflineMode()    → Cambiar entre Online/Offline');
    console.log('  updateCacheInfo()      → Actualizar UI del caché');
    console.log('\n%c💾 ALMACENAMIENTO', 'font-size: 12px; font-weight: bold;');
    console.log('  exportCacheInfo()      → Exportar caché como JSON');
    console.log('  wipeCacheForReal()     → Limpiar TODOS los tiles');
    console.log('  clearCache()           → Limpiar caché (con confirmación)');
    console.log('\n%c❓ AYUDA', 'font-size: 12px; font-weight: bold;');
    console.log('  cacheHelp()            → Ver esta ayuda\n');
}

// Mostrar ayuda al cargar
console.log('%c💡 Sistema de Caché Cargado. Escribe "cacheHelp()" para ver comandos.', 'color: #0066cc; font-weight: bold;');

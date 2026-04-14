/**
 * diagnostics.js
 * Herramientas de diagnóstico para debugging del sistema de caché
 * Cargar en consola: no se carga automáticamente
 * Uso: copiar y pegar en consola del navegador
 */

/**
 * Mostrar resumen completo del caché
 */
async function diagnosticoCacheCompleto() {
    console.clear();
    console.log('%c🔍 DIAGNÓSTICO COMPLETO DEL CACHÉ', 'color: #0066cc; font-size: 16px; font-weight: bold;');
    console.log('%c' + '='.repeat(60), 'color: #0066cc');
    
    const tiles = await tileCache.getAllTiles();
    const stats = await getCacheStatistics();
    
    console.log(`\n📊 ESTADÍSTICAS GENERALES`);
    console.log(`├─ Total de tiles: ${tiles.length}`);
    console.log(`├─ Tamaño total: ${(stats.totalSize / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`├─ Modo actual: ${MAP_STATE.offlineMode ? '🔴 OFFLINE' : '🟢 ONLINE'}`);
    console.log(`└─ Capa actual: ${MAP_STATE.currentLayer}`);
    
    console.log(`\n📍 TILES POR LAYER`);
    Object.entries(stats.byLayer).forEach(([layer, info]) => {
        const size = (info.size / (1024 * 1024)).toFixed(2);
        console.log(`├─ ${layer}`);
        console.log(`│  ├─ Cantidad: ${info.count} tiles`);
        console.log(`│  └─ Tamaño: ${size} MB`);
    });
    
    console.log(`\n🔍 TILES POR ZOOM LEVEL`);
    const zoomKeys = Object.keys(stats.byZoom).map(z => parseInt(z)).sort((a, b) => a - b);
    zoomKeys.forEach((zoom, idx) => {
        const info = stats.byZoom[zoom];
        const size = (info.size / (1024 * 1024)).toFixed(2);
        const isLast = idx === zoomKeys.length - 1;
        const prefix = isLast ? '└─' : '├─';
        const connector = isLast ? '   ' : '│  ';
        console.log(`${prefix} Z${zoom}`);
        console.log(`${connector}├─ Cantidad: ${info.count} tiles`);
        console.log(`${connector}└─ Tamaño: ${size} MB`);
    });
    
    console.log(`\n📝 ÚLTIMOS 10 TILES CACHEADOS (más recientes primero)`);
    tiles.sort((a, b) => b.timestamp - a.timestamp).slice(0, 10).forEach((tile, idx) => {
        const z = tile.zoomLevel || '?';
        const size = ((tile.size || 0) / 1024).toFixed(1);
        const t = new Date(tile.timestamp).toLocaleTimeString();
        console.log(`${idx + 1}. Z${z} [${tile.layer}] ${size}KB - ${t}`);
    });
    
    console.log(`\n⚠️ VERIFICACIÓN DE PROBLEMAS`);
    let problemas = 0;
    
    // Verificar CORS
    if (stats.byLayer.satellite && stats.byLayer.satellite.count > 0) {
        console.log(`✅ Satélite está siendo cacheado (CORS resuelto)`);
    } else {
        console.log(`❌ Satélite NO se está cacheando (verificar CORS)`);
        problemas++;
    }
    
    // Verificar múltiples zoom levels
    if (zoomKeys.length > 2) {
        console.log(`✅ Se están cacheando múltiples zoom levels (${zoomKeys.length} diferentes)`);
    } else if (zoomKeys.length > 0) {
        console.log(`⚠️ Solo se cachean ${zoomKeys.length} zoom level(s) - navega a diferentes zoom para cachear más`);
    }
    
    // Verificar tamaño
    if (stats.totalSize > 10 * 1024 * 1024) {
        console.log(`⚠️ Caché muy grande (${(stats.totalSize / (1024 * 1024)).toFixed(0)} MB) - considera limpiar`);
    } else if (stats.totalSize > 0) {
        console.log(`✅ Tamaño de caché razonable`);
    }
    
    if (problemas === 0) {
        console.log(`\n✅ ESTADO: Todo parece estar funcionando correctamente`);
    } else {
        console.log(`\n⚠️ ESTADO: Se detectaron ${problemas} problema(s)`);
    }
    
    console.log('%c' + '='.repeat(60), 'color: #0066cc');
}

/**
 * Verificar qué tiles falta cachear en un zoom específico
 */
async function verificarTilesZoom(zoomLevel) {
    console.log(`\n🔍 TILES EN ZOOM LEVEL ${zoomLevel}`);
    
    const tiles = await tileCache.getAllTiles();
    const tilesEnZoom = tiles.filter(t => t.zoomLevel === zoomLevel);
    
    if (tilesEnZoom.length === 0) {
        console.log(`❌ No hay tiles cacheados en Z${zoomLevel}`);
        return;
    }
    
    console.log(`✅ Encontrados ${tilesEnZoom.length} tiles en Z${zoomLevel}:`);
    
    // Agrupar por layer
    const porLayer = {};
    tilesEnZoom.forEach(tile => {
        if (!porLayer[tile.layer]) porLayer[tile.layer] = [];
        porLayer[tile.layer].push(tile);
    });
    
    Object.entries(porLayer).forEach(([layer, tiles]) => {
        const sizeTotal = tiles.reduce((sum, t) => sum + (t.size || 0), 0);
        console.log(`\n  📍 ${layer}: ${tiles.length} tiles (${(sizeTotal / 1024 / 1024).toFixed(2)} MB)`);
        tiles.slice(0, 5).forEach(t => {
            console.log(`     • ${t.url.split('/').slice(-1)[0]}`);
        });
        if (tiles.length > 5) {
            console.log(`     ... y ${tiles.length - 5} más`);
        }
    });
}

/**
 * Comparar una URL esperada con lo que está en caché
 */
async function buscarTile(urlParcial) {
    const tiles = await tileCache.getAllTiles();
    const encontrados = tiles.filter(t => t.url.includes(urlParcial));
    
    if (encontrados.length === 0) {
        console.log(`❌ No se encontraron tiles que coincidan con: "${urlParcial}"`);
        return;
    }
    
    console.log(`✅ Encontrados ${encontrados.length} tile(s):`);
    encontrados.forEach(t => {
        const size = ((t.size || 0) / 1024).toFixed(1);
        console.log(`   • Z${t.zoomLevel} [${t.layer}] ${size}KB`);
        console.log(`     URL: ${t.url}`);
    });
}

/**
 * Simular navegación para ver qué tiles se intentarían cargar
 */
async function diagnosticoOffline() {
    console.log(`\n📡 DIAGNÓSTICO MODO OFFLINE`);
    
    if (!MAP_STATE.offlineMode) {
        console.log(`⚠️ El mapa NO está en modo offline. Activalo primero.`);
        return;
    }
    
    const tiles = await tileCache.getAllTiles();
    const stats = await getCacheStatistics();
    
    console.log(`✅ Modo OFFLINE activado`);
    console.log(`📊 Total de tiles disponibles: ${tiles.length}`);
    console.log(`📂 Distribuido en:`);
    
    Object.entries(stats.byLayer).forEach(([layer, info]) => {
        const pct = ((info.count / tiles.length) * 100).toFixed(1);
        console.log(`   • ${layer}: ${info.count} tiles (${pct}%)`);
    });
    
    const zoomKeys = Object.keys(stats.byZoom).map(z => parseInt(z)).sort((a, b) => a - b);
    console.log(`🔍 Zoom levels disponibles: ${zoomKeys.join(', ')}`);
    
    const zoomMin = Math.min(...zoomKeys);
    const zoomMax = Math.max(...zoomKeys);
    console.log(`   Rango: Z${zoomMin} a Z${zoomMax}`);
    
    if (zoomMax - zoomMin < 2) {
        console.log(`⚠️ Rango de zoom muy pequeño - habrá tiles rojos al cambiar zoom`);
    }
}

/**
 * Comandos disponibles
 */
function ayuda() {
    console.clear();
    console.log('%c📚 HERRAMIENTAS DE DIAGNÓSTICO DISPONIBLES', 'color: #28a745; font-size: 14px; font-weight: bold;');
    console.log(`
Copia y pega estos comandos en la consola:

🔍 GENERAL
├─ diagnosticoCacheCompleto()     → Resumen completo del caché
├─ diagnosticoOffline()            → Diagnóstico del modo offline
└─ ayuda()                          → Mostrar esta ayuda

📍 POR ZOOM
├─ verificarTilesZoom(13)          → Ver tiles en zoom level 13
├─ verificarTilesZoom(14)          → Ver tiles en zoom level 14
└─ verificarTilesZoom(15)          → Ver tiles en zoom level 15 (etc)

🔎 BÚSQUEDA
├─ buscarTile('satellite')         → Buscar tiles de satélite
├─ buscarTile('4123')              → Buscar tile específico por coordenada
└─ buscarTile('openstreetmap')     → Buscar tiles de OpenStreetMap

⚙️ FUNCIONES DEL SISTEMA
├─ updateCacheInfo()               → Actualizar estadísticas de UI
├─ getCacheStatistics()            → Obtener objeto de estadísticas
├─ tileCache.getAllTiles()         → Obtener todos los tiles
└─ tileCache.getCacheSize()        → Obtener tamaño total

🗑️ LIMPIEZA
├─ tileCache.clearCache()          → LIMPIAR TODO EL CACHÉ
└─ clearCache()                    → Limpiar caché (con confirmación)
    `);
}

// Mostrar ayuda al cargar
console.log('%c✅ Herramientas de diagnóstico cargadas. Escribe: ayuda()', 'color: green; font-weight: bold;');
console.log('%cℹ️ Para ver todas las herramientas disponibles, ejecuta: ayuda()', 'color: blue');

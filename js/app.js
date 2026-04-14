/**
 * app.js
 * Script principal que inicializa la aplicación
 */

// Variable global para el caché (se inicializa aquí)
let tileCache;

/**
 * Inicializa la aplicación completa
 */
async function initializeApp() {
    console.log('🚀 Iniciando aplicación...');
    
    // 1. Inicializar sistema de caché
    console.log('📦 Inicializando sistema de caché...');
    tileCache = new TileCache();
    
    // 2. Crear el mapa
    console.log('🗺️ Creando mapa...');
    MAP_STATE.map = L.map('map').setView(MAP_CONFIG.center, MAP_CONFIG.initialZoom);
    
    // 3. Inicializar capas
    console.log('📚 Inicializando capas...');
    initializeLayers();
    
    // 4. Agregar marcadores y características
    console.log('📍 Agregando marcadores y características...');
    addMarkersAndFeatures();

    // 4.1 Agregar rutas de buses y paradas
    console.log('🚌 Cargando ruta de bus A1...');
    await addBusRoutes();

    const shouldShowBusA1 = document.body?.dataset?.showBusA1 === 'true';

    // 4.2 Inicio debe mostrarse sin rutas activas (excepto en index-pruebas).
    if (typeof toggleBusRouteA1 === 'function') {
        toggleBusRouteA1(shouldShowBusA1);
    }
    
    // 5. Agregar controles del mapa
    console.log('🎮 Agregando controles del mapa...');
    addMapControls();
    
    // 6. Configurar event listeners
    console.log('👂 Configurando event listeners...');
    setupMapEventListeners();
    setupNetworkListeners();
    
    // 7. Inicializar sistema de caché
    console.log('💾 Inicializando sistema de caché...');
    initializeCacheSystem();
    
    console.log('✅ Aplicación inicializada correctamente');
}

/**
 * Esperar a que el DOM esté listo
 */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

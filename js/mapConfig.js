/**
 * mapConfig.js
 * Configuración global del mapa
 */

// Estado global del mapa
const MAP_CONFIG = {
    // Coordenadas de Tunja, Colombia
    center: [5.5277, -73.3639],
    initialZoom: 13,
    
    // Límites de zoom
    minZoom: 2,
    maxZoom: 19,
    
    // Puntos de interés
    pointsOfInterest: [
        {
            nombre: 'Catedral Metropolitana',
            coords: [5.5285, -73.3645],
            descripcion: 'Iglesia principal de Tunja'
        },
        {
            nombre: 'Plaza de Bolívar',
            coords: [5.5278, -73.3632],
            descripcion: 'Centro histórico de la ciudad'
        },
        {
            nombre: 'Iglesia de Santo Domingo',
            coords: [5.5305, -73.3615],
            descripcion: 'Patrimonio cultural'
        },
        {
            nombre: 'Palacio de Nariño (Tunja)',
            coords: [5.5240, -73.3650],
            descripcion: 'Sitio histórico importante'
        }
    ],

    // Rutas de transporte publico y paradas
    busRoutes: {
        a1: {
            id: 'A1',
            name: 'Ruta A1 (Oriente a Norte)',
            color: '#ff6b00',
            stops: [
                { order: 1, name: 'Origen', lat: 5.574197, lng: -73.331616 },
                { order: 2, name: 'Clinica medilaser', lat: 5.569795, lng: -73.336921 },
                { order: 3, name: 'Los Muiscas', lat: 5.571341, lng: -73.341070 },
                { order: 4, name: 'Centro comercial el nogal', lat: 5.569566, lng: -73.343798 },
                { order: 5, name: 'Bavaria', lat: 5.562331, lng: -73.347813 },
                { order: 6, name: 'Secretaria De Transito Y Transporte De Tunja', lat: 5.562331, lng: -73.347813 },
                { order: 7, name: 'Empresa De Energia De Boyaca S.A. E.S.P. Norte', lat: 5.558006, lng: -73.349820 },
                { order: 8, name: 'Centro comercial Centro Norte', lat: 5.555852, lng: -73.350826 },
                { order: 9, name: 'Pozo de Hunzahaa (Donato)', lat: 5.551113, lng: -73.353221 },
                { order: 10, name: 'UPTC', lat: 5.549326, lng: -73.354662 },
                { order: 11, name: 'Glorieta Hugolino', lat: 5.543043, lng: -73.359004 },
                { order: 12, name: 'Maldonado', lat: 5.540342, lng: -73.360081 },
                { order: 13, name: 'Plazoleta de las Nieves (Plaza de los Muiscas)', lat: 5.538352, lng: -73.360323 },
                { order: 14, name: 'Parque Pinzon', lat: 5.536205, lng: -73.360187 },
                { order: 15, name: 'Registraduria Especial de Tunja', lat: 5.536205, lng: -73.360187 },
                { order: 16, name: 'Paseo De La Salamandra', lat: 5.534712, lng: -73.360787 },
                { order: 17, name: 'Auditorio Boyaquira', lat: 5.533721, lng: -73.360762 },
                { order: 18, name: 'Plaza de Bolivar', lat: 5.532499, lng: -73.361416 },
                { order: 19, name: 'Antiguo terminal', lat: 5.528926, lng: -73.360377 },
                { order: 20, name: 'Barrio Jordan', lat: 5.523181, lng: -73.360936 },
                { order: 21, name: 'Cancha De Futbol Jordan', lat: 5.522327, lng: -73.360477 },
                { order: 22, name: 'Puesto de Salud San Antonio', lat: 5.522327, lng: -73.360477 },
                { order: 23, name: 'Patinodromo Tunja', lat: 5.520998, lng: -73.358362 },
                { order: 24, name: 'Coliseo Cubierto San Antonio', lat: 5.520298, lng: -73.357200 },
                { order: 25, name: 'Xativilla', lat: 5.520753, lng: -73.355653 },
                { order: 26, name: 'Los Patriotas', lat: 5.524757, lng: -73.355457 },
                { order: 27, name: 'Universidad Nacional Abierta y a Distancia - UNAD', lat: 5.529128, lng: -73.351376 },
                { order: 28, name: 'Barrio Curubal', lat: 5.529128, lng: -73.351376 },
                { order: 29, name: 'Barrio Prados De San Luis', lat: 5.533947, lng: -73.346598 },
                { order: 30, name: 'Terminal', lat: 5.530917, lng: -73.345299 }
            ]
        }
    },
    
    // Configuración de capas - TODAS con orden {z}/{x}/{y} para consistencia
    layers: {
        openstreetmap: {
            url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            attribution: '© OpenStreetMap contributors',
            name: 'openstreetmap'
        },
        satellite: {
            // ✅ Cambiar a proveedor que usa {z}/{x}/{y} estándar
            // USGS mantiene la URL consistente (antes era ArcGIS con {z}/{y}/{x})
            url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryAndBaseMapsRC/MapServer/tile/{z}/{y}/{x}',
            attribution: 'Tiles &copy; USGS',
            name: 'satellite',
        },
        terrain: {
            url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
            attribution: '© OpenTopoMap',
            name: 'terrain'
        }
    }
};

// Estado del mapa
let MAP_STATE = {
    offlineMode: false,
    currentLayer: 'openstreetmap',
    map: null,
    layers: {},
    memoryCacheList: [],
    MEMORY_CACHE_SIZE: 300
};

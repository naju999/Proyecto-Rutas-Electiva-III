// ============================================================================
// EJEMPLO: SERVIDOR CON REDIS PARA CACHÉ DE TILES
// ============================================================================

// NOTA: Este archivo es un EJEMPLO de cómo implementar caché con Redis
// en el backend. Para usar esto necesitas:
// 1. Node.js instalado
// 2. npm install express redis axios cors dotenv
// 3. Redis server corriendo en tu máquina o servidor

// ============================================================================
// OPCIÓN 1: SERVIDOR NODE.JS + EXPRESS + REDIS
// ============================================================================

/*
INSTALACIÓN:
```bash
npm init -y
npm install express redis axios cors dotenv
npm install -D nodemon
```

ARCHIVO: server.js
*/

const express = require('express');
const redis = require('redis');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Crear cliente Redis
const client = redis.createClient({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || null
});

client.on('error', (err) => console.error('Redis Error:', err));
client.on('connect', () => console.log('✅ Conectado a Redis'));

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Servir archivos estáticos

// ===== RUTAS DE TILES CON CACHÉ =====

/**
 * GET /api/tile/:z/:x/:y
 * 
 * Obtener un tile del mapa con caché en Redis
 * 
 * Params:
 *   z (int) - Nivel de zoom
 *   x (int) - Posición X
 *   y (int) - Posición Y
 *   layer (string, opcional) - Capa del mapa
 * 
 * Flujo:
 * 1. Buscar en Redis (caché)
 * 2. Si existe, devolver desde caché
 * 3. Si no existe, obtener de OSM
 * 4. Almacenar en Redis con TTL
 * 5. Devolver al cliente
 */
app.get('/api/tile/:z/:x/:y', async (req, res) => {
    try {
        const { z, x, y } = req.params;
        const layer = req.query.layer || 'osm';
        
        // Crear clave única para este tile
        const cacheKey = `tile:${layer}:${z}:${x}:${y}`;
        
        // Buscar en Redis
        console.log(`Buscando ${cacheKey} en Redis...`);
        const cachedTile = await client.get(cacheKey);
        
        if (cachedTile) {
            console.log(`✅ Cache HIT: ${cacheKey}`);
            res.set('Content-Type', 'image/png');
            res.set('X-Cache', 'HIT');
            return res.send(Buffer.from(cachedTile, 'base64'));
        }
        
        console.log(`❌ Cache MISS: ${cacheKey}`);
        
        // Obtener del servidor de origen
        const tileUrl = getTileUrl(layer, z, x, y);
        console.log(`Descargando desde: ${tileUrl}`);
        
        const response = await axios.get(tileUrl, {
            responseType: 'arraybuffer',
            timeout: 10000
        });
        
        const imageBase64 = Buffer.from(response.data, 'binary').toString('base64');
        
        // Guardar en Redis con TTL (24 horas)
        const ttl = 24 * 60 * 60; // 86400 segundos
        await client.setex(cacheKey, ttl, imageBase64);
        
        console.log(`💾 Tile guardado en caché: ${cacheKey}`);
        
        res.set('Content-Type', 'image/png');
        res.set('X-Cache', 'MISS');
        res.send(response.data);
        
    } catch (error) {
        console.error('Error al obtener tile:', error.message);
        res.status(500).json({ 
            error: 'Error al obtener tile',
            message: error.message 
        });
    }
});

/**
 * GET /api/cache/stats
 * 
 * Obtener estadísticas del caché
 */
app.get('/api/cache/stats', async (req, res) => {
    try {
        const info = await client.info('memory');
        const dbSize = await client.dbSize();
        
        res.json({
            tiles_cached: dbSize,
            redis_memory: info.used_memory_human,
            redis_memory_peak: info.used_memory_peak_human,
            uptime: info.uptime_in_seconds
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/cache/clear
 * 
 * Limpiar todo el caché
 */
app.post('/api/cache/clear', async (req, res) => {
    try {
        await client.flushdb();
        res.json({ message: 'Caché limpiado correctamente' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/cache/clear-layer
 * 
 * Limpiar caché de una capa específica
 */
app.post('/api/cache/clear-layer', async (req, res) => {
    try {
        const { layer } = req.body;
        
        // Buscar todas las claves de esta capa
        const keys = await client.keys(`tile:${layer}:*`);
        
        if (keys.length > 0) {
            await client.del(...keys);
        }
        
        res.json({ 
            message: `Limpiados ${keys.length} tiles de capa ${layer}`,
            count: keys.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/cache/tiles
 * 
 * Listar todos los tiles en caché
 */
app.get('/api/cache/tiles', async (req, res) => {
    try {
        const layer = req.query.layer || '*';
        const keys = await client.keys(`tile:${layer}:*`);
        
        res.json({
            total: keys.length,
            tiles: keys.map(k => {
                const [_, l, z, x, y] = k.split(':');
                return { layer: l, z: parseInt(z), x: parseInt(x), y: parseInt(y) };
            })
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== FUNCIONES HELPER =====

function getTileUrl(layer, z, x, y) {
    const urls = {
        'osm': `https://{s}.tile.openstreetmap.org/${z}/${x}/${y}.png`,
        'satellite': `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
        'terrain': `https://{s}.tile.opentopomap.org/${z}/${x}/${y}.png`
    };
    
    const url = urls[layer] || urls['osm'];
    return url.replace('{s}', ['a', 'b', 'c'][Math.floor(Math.random() * 3)]);
}

// ===== SERVIDOR =====

app.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
    console.log('Esperando conexión con Redis...');
});

// ============================================================================
// OPCIÓN 2: ARCHIVO CONFIGURACIÓN PARA DOCKER + REDIS
// ============================================================================

/*
ARCHIVO: docker-compose.yml

version: '3.8'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  nodejs-server:
    build: .
    ports:
      - "3000:3000"
    environment:
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - NODE_ENV=production
    depends_on:
      redis:
        condition: service_healthy
    volumes:
      - ./:/app
      - /app/node_modules

volumes:
  redis_data:

COMANDO PARA EJECUTAR:
docker-compose up -d
*/

// ============================================================================
// OPCIÓN 3: CLIENTE JAVASCRIPT ACTUALIZADO PARA USAR SERVIDOR
// ============================================================================

/*
// En el navegador, reemplaza las capas de tiles por llamadas al servidor

class CachedTileLayerWithServer extends L.TileLayer {
    async _loadTile(done, tile, tilePoint) {
        const image = (tile.img = L.DomUtil.create('img'));
        
        L.DomEvent.on(image, 'load', L.bind(this._tileOnLoad, this, done, tile));
        L.DomEvent.on(image, 'error', L.bind(this._tileOnError, this, done, tile));
        
        try {
            // Obtener del servidor con caché Redis
            const z = tilePoint.z;
            const x = tilePoint.x;
            const y = tilePoint.y;
            
            const response = await fetch(
                `http://localhost:3000/api/tile/${z}/${x}/${y}?layer=${this.options.name}`
            );
            
            if (response.ok) {
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                image.src = url;
                
                // Mostrar indicador de caché
                const fromCache = response.headers.get('X-Cache') === 'HIT';
                console.log(`Tile ${z}/${x}/${y}: ${fromCache ? 'CACHED' : 'NEW'}`);
            }
        } catch (error) {
            console.error('Error cargando tile:', error);
            image.src = 'data:image/svg+xml,%3Csvg xmlns...'
        }
    }
}

// Usar la nueva clase
let cachedLayer = new CachedTileLayerWithServer('', {
    name: 'osm'
});
*/

// ============================================================================
// OPCIÓN 4: ESTADÍSTICAS Y MONITOREO EN TIEMPO REAL
// ============================================================================

/*
AGREGAR A CLIENTE:

async function mostrarStatsCache() {
    try {
        const response = await fetch('http://localhost:3000/api/cache/stats');
        const stats = await response.json();
        
        console.log('📊 Estadísticas del Caché:');
        console.log(`  Tiles en caché: ${stats.tiles_cached}`);
        console.log(`  Memoria Redis: ${stats.redis_memory}`);
        console.log(`  Memoria pico: ${stats.redis_memory_peak}`);
        console.log(`  Uptime: ${stats.uptime}s`);
    } catch (error) {
        console.error('Error al obtener estadísticas:', error);
    }
}

// Actualizar cada 30 segundos
setInterval(mostrarStatsCache, 30000);
*/

// ============================================================================
// MONGODB ALTERNATIVE (EN LUGAR DE REDIS)
// ============================================================================

/*
Si prefieres usar MongoDB en lugar de Redis:

npm install express mongoose axios cors

const mongoose = require('mongoose');

const tileSchema = new mongoose.Schema({
    key: { type: String, unique: true, index: true },
    z: Number,
    x: Number,
    y: Number,
    layer: String,
    imageData: Buffer,
    createdAt: { type: Date, default: Date.now, expires: 86400 } // TTL 24h
});

const Tile = mongoose.model('Tile', tileSchema);

// Guardar
const newTile = await Tile.create({
    key: cacheKey,
    z, x, y, layer,
    imageData: imageBuffer
});

// Obtener
const tile = await Tile.findOne({ key: cacheKey });
*/

// ============================================================================
// NOTAS IMPORTANTES
// ============================================================================

/*
1. SEGURIDAD:
   - Usa variables de entorno para credenciales
   - Implementa autenticación para endpoints
   - Valida inputs (z, x, y deben ser números válidos)
   - Limita rate limiting para evitar abuso

2. RENDIMIENTO:
   - Usa compresión (gzip) para respuestas
   - Implementa clustering de Node.js
   - Considera CDN (Cloudflare, AWS CloudFront)
   - Pre-cachea zonas populares

3. MONITOREO:
   - Registra métricas de cache hit/miss
   - Monitorea memoria Redis
   - Establece alertas para problemas
   - Usa herramientas como Prometheus + Grafana

4. ESCALABILIDAD:
   - Usa Redis Cluster para múltiples nodos
   - Implementa sticky sessions si es necesario
   - Considera Elasticsearch para búsquedas
   - Usa load balancing (Nginx)

5. FALLBACK:
   - Si Redis no está disponible, obtener directo de OSM
   - Implementar caché local en IndexedDB también
   - Log de errores para debugging
*/

module.exports = app;

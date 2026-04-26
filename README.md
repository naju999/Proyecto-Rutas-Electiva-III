# Proyecto Rutas Electiva III

La aplicación principal del repositorio vive ahora en la raíz. El código React/PWA es la entrada oficial y la estructura histórica ya no forma parte del flujo principal.

## Estructura actual

- [src](src): aplicación React + Vite + PWA.
- [public](public): manifest, service worker, iconos y fallback offline.
- [start-server.py](start-server.py): servidor local que publica el build React/PWA.
- [start-server.cmd](start-server.cmd): lanzador para Windows.
- [start-server.sh](start-server.sh): lanzador para entornos Unix.

## Flujo de uso

1. Instalar dependencias con `npm install`.
2. Sincronizar rutas GeoJSON con `npm run sync:routes`.
3. Construir la app con `npm run build`.
4. Servir el build con `python start-server.py` o el script equivalente del sistema operativo.

## Rutas dinamicas desde GeoJSON

- La PWA ya no usa rutas quemadas en el codigo.
- El catalogo se genera desde los archivos `database/Ruta*.geojson`.
- Cada ruta debe tener 3 archivos: un `Despacho` (o `Despachos`) y dos trazados de recorrido.

Comando de sincronizacion:

- `npm run sync:routes`

Ese comando:

- Copia los GeoJSON usados por la app a `public/data/routes/`.
- Genera el manifest `public/data/routes-manifest.json`.
- Omite rutas incompletas y las reporta en consola.

Flujo recomendado cuando agregues o cambies rutas:

1. Guardar/actualizar archivos GeoJSON en `database/`.
2. Ejecutar `npm run sync:routes`.
3. Ejecutar `npm run build`.
4. Reiniciar el servidor de la app para servir el nuevo build.

## Estado del proyecto

- React/PWA es el código principal.
- La raíz expone la app y su build directamente.
- La estructura apunta a mantenimiento y despliegue de una sola app.

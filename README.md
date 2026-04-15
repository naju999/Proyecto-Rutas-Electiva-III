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
2. Construir la app con `npm run build`.
3. Servir el build con `python start-server.py` o el script equivalente del sistema operativo.

## Estado del proyecto

- React/PWA es el código principal.
- La raíz expone la app y su build directamente.
- La estructura apunta a mantenimiento y despliegue de una sola app.

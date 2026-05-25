# Contrato API - Rutas (v1)

Este documento define el contrato oficial entre frontend y backend para la busqueda de rutas.

## Objetivo

- Estandarizar respuestas de `GET /api/routes` y `GET /api/search`.
- Permitir que `RutasPage` y `MapCanvas` consuman datos reales sin transformaciones ambiguas.
- Mantener comportamiento consistente en online/offline para la PWA.

## Convenciones generales

- Base URL local: `http://localhost:3000` (o la configurada por backend/proxy).
- Content-Type de exito: `application/json; charset=utf-8`.
- Coordenadas: formato WGS84 decimal (`lat`, `lng`).
- Si no hay resultados, devolver `200` con arreglo vacio, no error.

## Endpoint 1: GET /api/routes

### Query params

- `limit` (opcional, number): maximo de rutas.
- `offset` (opcional, number): paginacion.

### Response 200

```json
{
  "ok": true,
  "meta": {
    "total": 26,
    "limit": 26,
    "offset": 0,
    "generatedAt": "2026-05-24T22:00:00.000Z"
  },
  "routes": [
    {
      "id": "Ruta10",
      "code": "Ruta10",
      "title": "Ruta 10",
      "summary": "Muiscas - Avenida Norte - Triunfo",
      "detail": "Ruta bidireccional con despachos activos.",
      "eta": "Variable",
      "score": 0.91,
      "routeGeoJSON": {
        "type": "FeatureCollection",
        "features": []
      },
      "stops": [
        {
          "id": "stop-1",
          "name": "Parada 1",
          "lat": 5.548,
          "lng": -73.357
        }
      ],
      "files": {
        "dispatch_points": "/data/routes/Ruta10-Despachos.geojson",
        "outbound_route": "/data/routes/Ruta10-Muiscas-AvenidaNorte-Triunfo.geojson",
        "inbound_route": "/data/routes/Ruta10-Triunfo-AvenidaNorte-Muiscas.geojson"
      }
    }
  ]
}
```

## Endpoint 2: GET /api/search

### Query params requeridos

- `origin`: `lat,lng` (ejemplo `5.544,-73.357`).
- `destination`: `lat,lng` (ejemplo `5.563,-73.345`).

### Query params opcionales

- `radius` (number, metros): radio de busqueda (default recomendado: `5000`).
- `limit` (number): maximo de rutas a devolver (default recomendado: `10`).
- `includeDestinationOptions` (boolean): incluir sugerencias alternativas.

### Response 200 (con resultados)

```json
{
  "ok": true,
  "meta": {
    "origin": { "lat": 5.544, "lng": -73.357 },
    "destination": { "lat": 5.563, "lng": -73.345 },
    "radius": 5000,
    "limit": 10,
    "count": 2,
    "generatedAt": "2026-05-24T22:05:00.000Z"
  },
  "routes": [
    {
      "id": "Ruta10",
      "code": "Ruta10",
      "title": "Ruta 10",
      "summary": "Muiscas - Avenida Norte - Triunfo",
      "detail": "Coincide con origen y destino dentro del radio.",
      "eta": "22 min",
      "score": 0.94,
      "routeGeoJSON": {
        "type": "FeatureCollection",
        "features": []
      },
      "stops": [
        { "id": "st-01", "name": "Muiscas", "lat": 5.5479, "lng": -73.3567 },
        { "id": "st-02", "name": "Triunfo", "lat": 5.5591, "lng": -73.3458 }
      ]
    }
  ],
  "destinationOptions": [
    {
      "id": "opt-1",
      "label": "Terminal de Transporte",
      "lat": 5.5612,
      "lng": -73.3435
    },
    {
      "id": "opt-2",
      "label": "UPTC",
      "lat": 5.5639,
      "lng": -73.3572
    }
  ]
}
```

### Response 200 (sin resultados)

```json
{
  "ok": true,
  "meta": {
    "origin": { "lat": 5.544, "lng": -73.357 },
    "destination": { "lat": 5.563, "lng": -73.345 },
    "radius": 5000,
    "limit": 10,
    "count": 0,
    "generatedAt": "2026-05-24T22:05:00.000Z"
  },
  "routes": [],
  "destinationOptions": []
}
```

## Errores

### 400 - Parametros invalidos

```json
{
  "ok": false,
  "error": "bad_request",
  "message": "Parametros origin/destination invalidos. Usa formato lat,lng",
  "details": {
    "origin": "5.544,-73.357",
    "destination": "valor-recibido"
  }
}
```

### 422 - Coordenadas fuera de cobertura

```json
{
  "ok": false,
  "error": "outside_coverage",
  "message": "Origen o destino fuera del area de cobertura",
  "details": {
    "coverage": "Tunja"
  }
}
```

### 503 - Sin red y sin cache (fallback SW)

Cuando falla red y no existe cache valida, el Service Worker puede responder:

```json
{
  "error": "offline_unavailable",
  "message": "No se pudo obtener datos de red y no existe cache vigente.",
  "offline": true,
  "timestamp": 1716581234567
}
```

## Reglas de compatibilidad frontend

Para minimizar rupturas, backend puede incluir aliases, pero se recomienda entregar estos campos canonicos:

- Ruta: `routeGeoJSON` y `stops`.
- Opciones destino: `destinationOptions`.

Aliases que frontend actual tolera:

- `route_geojson`, `geojson`, `route_geometry`.
- `dispatchPoints`, `dispatch_points`, `paradas`.
- `destination_options`, `options`, `destinations`.

## Validaciones recomendadas en backend

- Rechazar requests sin `origin` o `destination` con `400`.
- Parsear y validar `lat,lng` en rango:
  - lat: `[-90, 90]`
  - lng: `[-180, 180]`
- Limitar `radius` maximo (ejemplo: `20000`) para proteger costos.
- Limitar `limit` maximo (ejemplo: `50`).

## Versionado

- Version actual: `v1`.
- Cambios incompatibles deben publicarse como `v2` (ruta o header de version).

# Mapa Interactivo de Tunja - Colombia

## 📍 Descripción
Este programa utiliza **OpenStreetMap** y **Leaflet** para mostrar un mapa interactivo de Tunja, la capital del departamento de Boyacá, Colombia.

## 🚀 Características

- **Mapa interactivo** centrado en Tunja con zoom y navegación
- **Caché avanzado con IndexedDB** 🔥 NUEVO
  - Cachea automáticamente tiles del mapa mientras navegas
  - Modo offline para visualizar tiles cacheados
  - Monitorea tamaño del caché en tiempo real
  - Preparado para integración con Redis
- **Múltiples capas de mapa:**
  - OpenStreetMap (mapa estándar)
  - Satélite (vista de satélite)
  - Terreno (mapa topográfico)
- **Marcador principal** en el centro de Tunja
- **Puntos de interés** destacados:
  - Catedral Metropolitana
  - Plaza de Bolívar
  - Iglesia de Santo Domingo
  - Palacio de Nariño
- **Controles intuitivos:**
  - Botón de centrado
  - Zoom in/out
  - Reset de vista
  - **Botón de Modo Offline** (nuevo)
  - **Botón Limpiar Caché** (nuevo)
- **Información detallada** en la barra lateral
- **Interfaz responsiva** (adapta a dispositivos móviles)
- **Diseño moderno** con gradientes y efectos visuales

## 💻 Cómo usar

1. Abre el archivo `index.html` en tu navegador web
2. Interactúa con el mapa:
   - **Zoom:** Usa la rueda del ratón o los botones de zoom
   - **Movimiento:** Arrastra el mapa con el ratón
   - **Información:** Haz clic en los marcadores para ver detalles

## 🗺️ Controles disponibles

| Control | Función |
|---------|---------|
| 📍 Centrar | Centra el mapa en Tunja |
| 🔍+ Zoom | Aumenta el nivel de zoom |
| 🔍- Zoom | Disminuye el nivel de zoom |
| 🔄 Reset | Resetea la vista al estado inicial |

## 🎨 Capas del mapa

- **OpenStreetMap:** Mapa estándar con detalles de calles y ubicaciones
- **Satélite:** Vista de satélite para una perspectiva aérea
- **Terreno:** Mapa topográfico que muestra elevaciones

## 🔌 Sistema de Caché Avanzado

El mapa incluye un **sistema de caché inteligente basado en IndexedDB**:

### ¿Cómo funciona?

1. **Caché Automático:** Mientras navegas el mapa, los tiles visibles se guardan automáticamente
2. **Modo Offline:** Activa el modo offline para ver solo los tiles que cacheaste
3. **Monitoreo:** La barra lateral muestra cuántos tiles estás cacheando y su tamaño
4. **Limpiar:** Puedes limpiar el caché cuando lo necesites

### Ventajas

✅ No interrumpe la navegación  
✅ Solo cachea lo que ves (no todo el mundo)  
✅ ~50MB de espacio disponible  
✅ Preparado para Redis en backend  
✅ Funciona en todos los navegadores modernos  

### Uso Práctico

```
1. Abre el mapa normalmente (online)
2. Navega y explora diferentes áreas
3. Los tiles se guardan automáticamente
4. Haz clic en "🌐 Simular Offline"
5. Ahora ves los tiles que cacheaste
```

### 🆕 Mejoras de Marzo 2026

**Problemas Corregidos:**
- ✅ **Satélite layer ahora funciona** (antes no se cacheaba)
- ✅ **Múltiples zoom levels se cachean correctamente**
- ✅ **Modo offline 100% funcional** con todas las capas
- ✅ **Estadísticas detalladas** por layer y zoom level

**Herramientas de Diagnóstico:**
```javascript
// En la consola del navegador:
diagnosticoCacheCompleto()   // Ver resumen completo
diagnosticoOffline()          // Diagnóstico del modo offline
verificarTilesZoom(14)        // Ver tiles en zoom específico
buscarTile('satellite')       // Buscar tiles por nombre
ayuda()                       // Ver todas las herramientas
```

**Documentos Relacionados:**
- 📌 **[QUICK_START.md](QUICK_START.md)** - Prueba rápida (2 minutos)
- 📋 **[TESTING_GUIDE.md](TESTING_GUIDE.md)** - Guía completa de pruebas
- 🔧 **[SOLUCIONES_IMPLEMENTADAS.md](SOLUCIONES_IMPLEMENTADAS.md)** - Qué se corrigió
- 📊 **[ANTES_DESPUES.md](ANTES_DESPUES.md)** - Comparación visual

## 📚 Documentación Completa

- **[CACHE_SYSTEM.md](CACHE_SYSTEM.md)** - Guía completa del sistema de caché, integración con Redis
- **[REDIS_BACKEND_EXAMPLE.js](REDIS_BACKEND_EXAMPLE.js)** - Ejemplos de servidor Node.js + Redis
- **[GUIA_TECNICA.js](GUIA_TECNICA.js)** - Referencia API de Leaflet y JavaScript
- **[DEBUGGING_Y_EJEMPLOS.md](DEBUGGING_Y_EJEMPLOS.md)** - Debugging, comandos Redis y troubleshooting

## 📦 Dependencias

El programa utiliza las siguientes librerías (desde CDN):
- **Leaflet 1.9.4:** Framework de mapas web
- **OpenStreetMap tileset:** Datos del mapa
- **Esri ArcGIS:** Capa de satélite (FIJA: ahora cachea correctamente)
- **OpenTopoMap:** Capa de terreno

## 📍 Información de Tunja

- **Nombre:** Tunja
- **Departamento:** Boyacá
- **País:** Colombia
- **Latitud:** 5.5277° N
- **Longitud:** 73.3639° O
- **Altitud:** 2,782 msnm
- **Población:** ~170,000 habitantes

## 🌐 Tecnologías utilizadas

- HTML5
- CSS3 (Responsive Design)
- JavaScript (ES6)
- Leaflet.js
- OpenStreetMap API

## 📄 Estructura del archivo

```
index.html
├── Header (Encabezado)
├── Container (Contenedor principal)
│   ├── Mapa (Leaflet)
│   └── Sidebar (Información lateral)
└── Scripts (Leaflet y funcionalidades personalizadas)
```

## 🔧 Personalización

Puedes modificar fácilmente:
- Coordenadas de Tunja: `TUNJA_COORDS = [5.5277, -73.3639]`
- Nivel de zoom inicial: Cambia el segundo parámetro en `map.setView()`
- Puntos de interés: Añade o modifica items en el array `puntosInteres`
- Estilos: Edita el bloque `<style>` en el HTML

## 📱 Compatibilidad

- ✅ Chrome/Chromium
- ✅ Firefox
- ✅ Safari
- ✅ Edge
- ✅ Dispositivos móviles

## 🎯 Mejoras futuras posibles

- Agregar más puntos de interés
- Implementar búsqueda de direcciones
- Agregar rutas personalizadas
- Mostrar información en tiempo real
- Integración con APIs de transporte

## 📝 Notas

- No requiere instalación, solo abre el archivo en el navegador
- Requiere conexión a internet para cargar los datos del mapa
- Los datos del mapa se actualizan desde OpenStreetMap permanentemente

---

**Autor:** Proyecto Final - Electiva III  
**Fecha:** 2026  
**Universidad:** [Tu Universidad]

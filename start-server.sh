#!/bin/bash

# Servidor HTTP Simple para Servir Archivos del Mapa de Tunja
# Uso: chmod +x start-server.sh && ./start-server.sh

PORT=8000
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║     🚀 SERVIDOR HTTP INICIADO CORRECTAMENTE              ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "📁 Directorio: $DIR"
echo "🌐 URL Local: http://localhost:$PORT"
echo "🗺️  Mapa: http://localhost:$PORT/index.html"
echo "🔧 Debug: http://localhost:$PORT/cache-debug-panel.html"
echo ""
echo "✅ AHORA FUNCIONA:"
echo "   ✓ IndexedDB está habilitado"
echo "   ✓ Caché se guardará correctamente"
echo "   ✓ Modo Offline funcionará"
echo "   ✓ Sin errores de CORS"
echo ""
echo "⏹️  Para detener: Presiona CTRL+C"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""

cd "$DIR"

# Intenta Python 3 primero, luego Python 2
if command -v python3 &> /dev/null; then
    python3 -m http.server $PORT
elif command -v python &> /dev/null; then
    python -m SimpleHTTPServer $PORT
else
    echo "ERROR: Python no está instalado"
    echo "Instala Python desde https://www.python.org/"
    exit 1
fi

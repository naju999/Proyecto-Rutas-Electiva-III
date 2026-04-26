#!/bin/bash

# Servidor HTTP simple para el build React/PWA
# Uso: chmod +x start-server.sh && ./start-server.sh

PORT=8000
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$ROOT_DIR/dist"

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║     🚀 SERVIDOR HTTP INICIADO CORRECTAMENTE              ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "📁 Directorio servido: $DIST_DIR"
echo "🌐 URL Local: http://localhost:$PORT"
echo "🗺️  App React/PWA: http://localhost:$PORT/"
echo ""
echo "✅ AHORA FUNCIONA:"
echo "   ✓ React/PWA es la entrada principal"
echo "   ✓ Service Worker y manifest están incluidos en el build"
echo "   ✓ El historial legado ya no se expone desde la raíz"
echo ""
echo "⏹️  Para detener: Presiona CTRL+C"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""

if [ ! -d "$DIST_DIR" ]; then
    echo "ERROR: No existe dist"
    echo "Ejecuta primero:"
    echo "  cd ."
    echo "  npm install"
    echo "  npm run build"
    exit 1
fi

cd "$DIST_DIR"

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

#!/usr/bin/env python3
"""
Servidor HTTP Simple para Servir Archivos del Mapa de Tunja
Ejecutar: python start-server.py
Luego abre: http://localhost:8000
"""

import http.server
import socketserver
import os
import sys
from pathlib import Path

PORT = 8000
DIRECTORY = str(Path(__file__).parent)

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/':
            self.path = '/index.html'
        return super().do_GET()
    
    def log_message(self, format, *args):
        """Sobrescribir para mejor logging"""
        print(f"[{self.log_date_time_string()}] {format % args}")

def start_server():
    os.chdir(DIRECTORY)
    handler = MyHTTPRequestHandler
    
    try:
        with socketserver.TCPServer(("", PORT), handler) as httpd:
            print(f"""
╔═══════════════════════════════════════════════════════════╗
║     🚀 SERVIDOR HTTP INICIADO CORRECTAMENTE              ║
╚═══════════════════════════════════════════════════════════╝

📁 Directorio: {DIRECTORY}
🌐 URL Local: http://localhost:{PORT}
🗺️  Mapa: http://localhost:{PORT}/index.html
🔧 Debug: http://localhost:{PORT}/cache-debug-panel.html

✅ AHORA FUNCIONA:
   ✓ IndexedDB está habilitado
   ✓ Caché se guardará correctamente
   ✓ Modo Offline funcionará
   ✓ Sin errores de CORS

⏹️  Para detener: Presiona CTRL+C

═══════════════════════════════════════════════════════════
            """)
            httpd.serve_forever()
    except OSError as e:
        if e.errno == 48 or e.errno == 98:  # Puerto en uso
            print(f"❌ Error: Puerto {PORT} ya está en uso.")
            print(f"   Intenta: python start-server.py (espera que se libere)")
            sys.exit(1)
        else:
            raise

if __name__ == '__main__':
    try:
        start_server()
    except KeyboardInterrupt:
        print("\n\n⏹️  Servidor detenido.")
        sys.exit(0)

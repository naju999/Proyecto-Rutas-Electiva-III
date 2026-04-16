#!/usr/bin/env python3
"""
Servidor HTTP simple para el build React/PWA.
Ejecutar: python start-server.py
Luego abre: http://localhost:8000
"""

import http.server
import socketserver
import os
import sys
from pathlib import Path

PORT = 8000
ROOT_DIRECTORY = Path(__file__).parent
DIST_DIRECTORY = ROOT_DIRECTORY / 'dist'

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/':
            self.path = '/index.html'
        return super().do_GET()
    
    def log_message(self, format, *args):
        """Sobrescribir para mejor logging"""
        print(f"[{self.log_date_time_string()}] {format % args}")

def start_server():
    if not DIST_DIRECTORY.exists():
        print('ERROR: No existe dist.')
        print('Ejecuta primero:')
        print('  cd .')
        print('  npm install')
        print('  npm run build')
        sys.exit(1)

    os.chdir(str(DIST_DIRECTORY))
    handler = MyHTTPRequestHandler
    
    try:
        with socketserver.TCPServer(("", PORT), handler) as httpd:
            print(f"""
╔═══════════════════════════════════════════════════════════╗
║       SERVIDOR HTTP INICIADO CORRECTAMENTE               ║
╚═══════════════════════════════════════════════════════════╝

Directorio servido: {DIST_DIRECTORY}
URL local: http://localhost:{PORT}
App React/PWA: http://localhost:{PORT}/

Estado actual:
 - React/PWA es la entrada principal.
 - La estructura histórica fue retirada de la raíz del proyecto.

Para detener: CTRL+C

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

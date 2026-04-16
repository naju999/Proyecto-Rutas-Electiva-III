@echo off
REM Iniciar servidor Python HTTP para release React/PWA
REM Este archivo inicia el servidor en http://localhost:8000 sirviendo dist

color 0f
cls

echo.
echo ╔═══════════════════════════════════════════════════════════╗
echo ║   INICIANDO SERVIDOR HTTP PARA RELEASE REACT/PWA        ║
echo ╚═══════════════════════════════════════════════════════════╝
echo.

REM Verificar si Python está instalado
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python no está instalado o no está en PATH
    echo.
    echo Soluciones:
    echo 1. Instala Python desde: https://www.python.org/
    echo 2. Marca "Add Python to PATH" durante la instalación
    echo 3. Reinicia este script
    echo.
    pause
    exit /b 1
)

REM Iniciar servidor
echo Iniciando servidor React/PWA...
echo.
python "%~dp0start-server.py"

if errorlevel 1 (
    echo.
    echo ERROR al iniciar servidor
    pause
    exit /b 1
)

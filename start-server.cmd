@echo off
REM Iniciar servidor Python HTTP para el mapa de Tunja
REM Este archivo inicia el servidor en http://localhost:8000

color 0f
cls

echo.
echo ╔═══════════════════════════════════════════════════════════╗
echo ║   INICIANDO SERVIDOR HTTP PARA MAPA DE TUNJA            ║
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
echo Iniciando servidor...
echo.
python "%~dp0start-server.py"

if errorlevel 1 (
    echo.
    echo ERROR al iniciar servidor
    pause
    exit /b 1
)

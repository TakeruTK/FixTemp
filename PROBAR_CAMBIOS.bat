@echo off
setlocal
title PulseGuard — Construyendo y probando cambios
set "APP_DIR=%~dp0"

:: Detectar Node.js
set "BUNDLED_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%BUNDLED_NODE%" (
  set "NODE_BIN=%BUNDLED_NODE%"
) else (
  where node >nul 2>nul || (
    echo ERROR: No se encontro Node.js. Instala Node.js 20+ y vuelve a intentarlo.
    pause
    exit /b 1
  )
  set "NODE_BIN=node"
)

cd /d "%APP_DIR%"

:: Detectar gestor de paquetes
set "VITE_BIN=%APP_DIR%node_modules\.bin\vite.cmd"
if not exist "%VITE_BIN%" (
  echo ERROR: node_modules no encontrado. Ejecuta primero: pnpm install
  pause
  exit /b 1
)

echo.
echo [1/2] Compilando frontend con Vite...
echo -----------------------------------------------
"%NODE_BIN%" "%APP_DIR%node_modules\vite\bin\vite.js" build
if errorlevel 1 (
  echo ERROR: La compilacion fallo. Revisa los errores arriba.
  pause
  exit /b 1
)

echo.
echo [2/2] Iniciando servidor PulseGuard...
echo -----------------------------------------------
echo Abriendo http://127.0.0.1:4310 en el navegador...
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:4310"
"%NODE_BIN%" "server\server.mjs"

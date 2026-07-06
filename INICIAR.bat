@echo off
setlocal
title PulseGuard
set "APP_DIR=%~dp0"
set "BUNDLED_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if exist "%BUNDLED_NODE%" (
  set "NODE_BIN=%BUNDLED_NODE%"
) else (
  where node >nul 2>nul || (
    echo No se encontro Node.js. Instala Node.js 20 o superior y vuelve a intentarlo.
    pause
    exit /b 1
  )
  set "NODE_BIN=node"
)

cd /d "%APP_DIR%"
start "" "http://127.0.0.1:4310"
"%NODE_BIN%" "server\server.mjs"

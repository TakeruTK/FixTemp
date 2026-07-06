# ============================================================
#  SETUP_GIT.ps1  —  Inicializa el repositorio PulseGuard
#  Ejecutar UNA sola vez desde PowerShell en D:\FIXTemp
#
#  PREREQUISITOS:
#    1. Git instalado  (winget install Git.Git)
#    2. Token GitHub con permisos "repo":
#       GitHub → Settings → Developer settings → Personal access tokens
#    3. Repositorio ya creado en GitHub:
#       https://github.com/TakeruTK/FixTemp  (vacio, sin README)
# ============================================================

$ErrorActionPreference = "Stop"
$GITHUB_USER = "TakeruTK"
$GITHUB_REPO = "FixTemp"
$REMOTE_BASE  = "https://github.com/$GITHUB_USER/$GITHUB_REPO.git"

# Pedir token si no está en entorno
if (-not $env:GITHUB_TOKEN) {
    $secure = Read-Host "Pega tu GitHub Personal Access Token" -AsSecureString
    $env:GITHUB_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    )
}
$REMOTE = "https://$GITHUB_USER`:$($env:GITHUB_TOKEN)@github.com/$GITHUB_USER/$GITHUB_REPO.git"

# ── 1. Limpiar .git corrupto y reinicializar ──────────────────────────────────
Write-Host "`n[1/6] Limpiando .git existente..." -ForegroundColor Cyan
if (Test-Path ".git") {
    Remove-Item -Recurse -Force ".git"
}
git init -b main
git config user.email "dbcontrerastrading@gmail.com"
git config user.name "TakeruTK"
Write-Host "OK - repo inicializado en rama 'main'" -ForegroundColor Green

# ── 2. Preparar ranking-server (scores vacio, dir updates) ───────────────────
Write-Host "`n[2/6] Preparando ranking-server..." -ForegroundColor Cyan
if (-not (Test-Path "ranking-server/scores.json")) {
    '{"records":[],"nextId":1}' | Out-File -Encoding utf8NoBOM "ranking-server/scores.json"
}
New-Item -ItemType Directory -Force "ranking-server/updates" | Out-Null
Write-Host "OK" -ForegroundColor Green

# ── 3. Commit inicial en main ─────────────────────────────────────────────────
Write-Host "`n[3/6] Commiteando en 'main'..." -ForegroundColor Cyan
git add .
$tracked = (git diff --cached --name-only | Measure-Object).Count
Write-Host "  $tracked archivos en stage"
$commitMsg = @"
feat: PulseGuard v0.6.0 - monitor de equipos Windows

Frontend React 19 + TypeScript + CSS custom (dark theme)
Backend Express con telemetria, stress tests, export Excel/ranking
Benchmarks reales: GPU WebGL2 224-iter / RAM 128MB secuencial
Sistema auto-update: check/download/install desde ranking-server
Ranking global con JSON DB, admin panel, Docker support
Instalador NSIS y sensor helper .NET para datos hardware
"@
git commit -m $commitMsg
Write-Host "OK - commit inicial en 'main'" -ForegroundColor Green

# ── 4. Rama develop ───────────────────────────────────────────────────────────
Write-Host "`n[4/6] Creando rama 'develop'..." -ForegroundColor Cyan
git checkout -b develop
Write-Host "OK - en rama 'develop'" -ForegroundColor Green

# ── 5. Push ambas ramas ───────────────────────────────────────────────────────
Write-Host "`n[5/6] Subiendo a GitHub..." -ForegroundColor Cyan
git remote add origin $REMOTE

Write-Host "  → main"
git push -u origin main

Write-Host "  → develop"
git push -u origin develop

# Limpiar token de la URL del remote (seguridad)
git remote set-url origin $REMOTE_BASE

# ── 6. Resumen ────────────────────────────────────────────────────────────────
Write-Host "`n[6/6] Listo!" -ForegroundColor Green
Write-Host ""
Write-Host "  Repo:    https://github.com/$GITHUB_USER/$GITHUB_REPO"
Write-Host "  Ramas:   main (estable)  |  develop (trabajo diario)"
Write-Host ""
Write-Host "  Flujo de trabajo:" -ForegroundColor Yellow
Write-Host "    git checkout develop          # siempre trabajar aqui"
Write-Host "    git add . && git commit -m `"...`""
Write-Host "    git push"
Write-Host ""
Write-Host "  Para publicar release:" -ForegroundColor Yellow
Write-Host "    git checkout main"
Write-Host "    git merge develop"
Write-Host "    git tag v0.6.1"
Write-Host "    git push && git push --tags"
Write-Host "    git checkout develop"

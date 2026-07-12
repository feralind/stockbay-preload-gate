@echo off
setlocal
cd /d "%~dp0"
title StockWay

:: Kill stale StockWay / Electron / servers so we never attach to an old build
powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command ^
  "Get-Process StockWay,electron,Electron -EA SilentlyContinue | Stop-Process -Force -EA SilentlyContinue; foreach ($p in 8080,3847,3848,8091) { Get-NetTCPConnection -LocalPort $p -EA SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -EA SilentlyContinue } }" >nul 2>&1

:: 1) LIVE desktop — Electron loads this folder's current source (not a frozen build)
if not exist "node_modules\electron\dist\electron.exe" (
  where npm >nul 2>&1
  if not errorlevel 1 (
    echo Installing StockWay desktop runtime (one-time)...
    call npm install --silent --no-fund --no-audit
  )
)

if not exist "assets\icon.ico" (
  where npm >nul 2>&1
  if not errorlevel 1 (
    call npm run icons >nul 2>&1
  )
)

if exist "node_modules\electron\dist\electron.exe" (
  start "" "node_modules\electron\dist\electron.exe" .
  exit /b 0
)

:: 2) Packaged exe fallback — only if Electron isn't available (frozen snapshot from last npm run build)
if exist "dist\win-unpacked\StockWay.exe" (
  start "" "dist\win-unpacked\StockWay.exe"
  exit /b 0
)

:: 3) Browser fallback — force a fresh Yahoo proxy (do not reuse stale serve)
powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -Silent -ForceRestart
exit /b 0

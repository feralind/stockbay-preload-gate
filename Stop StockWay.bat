@echo off
:: Kill StockWay servers on ports 8080 (browser) and 3847 (Electron)
cd /d "%~dp0"
powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command ^
  "$pidFile = Join-Path '%CD%' 'stockway.pid';" ^
  "if (Test-Path $pidFile) { Get-Content $pidFile | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }; Remove-Item $pidFile -ErrorAction SilentlyContinue };" ^
  "Get-Process StockWay,electron,Electron -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue; foreach ($p in 8080,3847,3848,8091) { Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"
echo StockWay stopped.
timeout /t 1 /nobreak >nul

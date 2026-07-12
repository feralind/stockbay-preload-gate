@echo off
:: Browser-only mode: start local web server and open browser.
cd /d "%~dp0"
powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -Silent -ForceRestart
exit /b 0

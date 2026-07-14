@echo off
:: LAN party mode: bind StockWay on your Wi-Fi/LAN IP so others can play-test.
cd /d "%~dp0"
echo.
echo  Starting StockWay for LAN access...
echo  Keep this window open. Share the http://YOUR-IP:8080 link it prints.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -Lan -ForceRestart
pause
exit /b 0

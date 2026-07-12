@echo off
setlocal EnableExtensions
title StockWay - Build Desktop Game
cd /d "%~dp0"

echo.
echo  ========================================
echo   StockWay - Building Desktop Game
echo  ========================================
echo.
echo  Output folder:
echo    dist\win-unpacked\StockWay.exe
echo.
echo  First run may download Electron (~150MB).
echo.

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js / npm is not installed.
  echo.
  echo 1. Download Node.js LTS from https://nodejs.org
  echo 2. Install it ^(check "Add to PATH"^)
  echo 3. Double-click build-exe.bat again
  echo.
  pause
  exit /b 1
)

:: Running StockWay/Electron locks the exe and breaks rebuilds
echo Stopping any running StockWay / Electron instances...
powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command ^
  "$root=(Get-Item '%CD%').FullName; $names=@('StockWay','electron'); Get-CimInstance Win32_Process | Where-Object { $n=$_.Name.Replace('.exe',''); ($names -contains $n) -and (($_.CommandLine -like ('*'+$root+'*')) -or ($_.ExecutablePath -like ('*'+$root+'*')) -or $_.Name -eq 'StockWay.exe') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Start-Sleep -Milliseconds 600" >nul 2>&1

if not exist "node_modules\electron" (
  echo Installing dependencies ^(one-time^)...
  call npm install --no-fund --no-audit
  if errorlevel 1 (
    echo.
    echo ERROR: npm install failed.
    pause
    exit /b 1
  )
)

if not exist "node_modules\rcedit" (
  echo Installing Windows resource stamp tool...
  call npm install rcedit --save-dev --no-fund --no-audit
  if errorlevel 1 (
    echo.
    echo ERROR: could not install rcedit.
    pause
    exit /b 1
  )
)

echo.
echo Building icons + StockWay.exe...
call npm run build
if errorlevel 1 (
  echo.
  echo ERROR: Build failed. See messages above.
  echo Tip: close StockWay.exe if it is open, then run this again.
  pause
  exit /b 1
)

if not exist "dist\win-unpacked\StockWay.exe" (
  echo.
  echo ERROR: Build finished but StockWay.exe was not found.
  echo Check the dist\ folder.
  pause
  exit /b 1
)

echo.
echo  ========================================
echo   SUCCESS
echo  ========================================
echo.
echo  Game folder:
echo    %cd%\dist\win-unpacked\
echo.
echo  Launch with:
echo    START HERE.bat
echo    or double-click dist\win-unpacked\StockWay.exe
echo.
echo  Taskbar / right-click should say StockWay ^(not Electron^).
echo.

start "" "dist\win-unpacked"
pause
exit /b 0

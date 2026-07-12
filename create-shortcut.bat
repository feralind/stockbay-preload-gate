@echo off
:: Desktop shortcut to START HERE (live source via Electron), not a frozen dist exe
cd /d "%~dp0"

set LAUNCH=%~dp0START HERE.bat
set SHORTCUT=%USERPROFILE%\Desktop\StockWay.lnk
set ICON=%~dp0assets\icon.ico

powershell -NoProfile -Command ^
  "$ws = New-Object -ComObject WScript.Shell; ^
   $s = $ws.CreateShortcut('%SHORTCUT%'); ^
   $s.TargetPath = '%LAUNCH%'; ^
   $s.WorkingDirectory = '%~dp0'; ^
   $s.Description = 'StockWay Paper Trade Simulator (live)'; ^
   if (Test-Path '%ICON%') { $s.IconLocation = '%ICON%' }; ^
   $s.Save()"

echo Desktop shortcut created: StockWay.lnk
echo Points to START HERE.bat (live Electron source — not frozen dist).
pause

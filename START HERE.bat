@echo off
cd /d "%~dp0"
:: Zero-console launch when desktop runtime exists
if exist "Launch StockWay.vbs" (
  wscript //nologo "Launch StockWay.vbs"
  exit /b 0
)
call "%~dp0play.bat"
exit /b 0

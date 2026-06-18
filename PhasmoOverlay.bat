@echo off
cd /d "%~dp0"
set APP=dist\PhasmoOverlay\PhasmoOverlay.exe
if not exist "%APP%" (
  echo.
  echo  Die App wurde noch nicht gebaut.
  echo  Bitte einmal ausfuehren:  npm run dist
  echo.
  pause
  exit /b 1
)
start "" "%APP%"

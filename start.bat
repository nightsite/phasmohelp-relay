@echo off
cd /d "%~dp0"
if not exist "node_modules" (
  echo Installiere Abhaengigkeiten beim ersten Start...
  call npm install
)
call npm start

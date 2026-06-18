@echo off
cd /d "%~dp0"
if not exist "node_modules" (
  echo Installiere Abhaengigkeiten beim ersten Mal...
  call npm install
)
call npm start

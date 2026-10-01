@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js fehlt. Bitte von https://nodejs.org die LTS-Version installieren und danach erneut starten.
  pause
  exit /b
)
if "%APP_PASSWORT%"=="" set APP_PASSWORT=verwertung
set PORT=3000
echo.
echo Verwertung-Tool startet ... Dieses Fenster offen lassen.
echo Kollegen im Firmennetz: http://%COMPUTERNAME%:3000
echo Passwort: %APP_PASSWORT%
echo.
start "" http://localhost:3000
node --disable-warning=ExperimentalWarning server.js
pause

@echo off
title ArogyaSync — Offline Healthcare System
color 0A

echo =====================================================================
echo             ArogyaSync - Offline Rural PHC System
echo =====================================================================
echo.
echo [*] Setting working directory...
cd /d "%~dp0"

echo [*] Starting local LoRa RF Middleware on port 5000...
start /min "ArogyaSync LoRa Backend" python backend\app.py

echo [*] Starting local Offline Web Server on port 3000...
start /min "ArogyaSync Web Frontend" cmd /c "npm run dev"

echo [*] Initializing local IndexedDB and service caches...
timeout /t 3 /nobreak >nul

echo [*] Launching ArogyaSync Standalone Desktop App...
where msedge >nul 2>&1
if %errorlevel% equ 0 (
    start msedge --app=http://localhost:3000
    goto done
)

where chrome >nul 2>&1
if %errorlevel% equ 0 (
    start chrome --app=http://localhost:3000
    goto done
)

start http://localhost:3000

:done
echo.
echo =====================================================================
echo  [OK] ArogyaSync is running 100%% offline!
echo       No internet connection is required.
echo =====================================================================
echo.
pause

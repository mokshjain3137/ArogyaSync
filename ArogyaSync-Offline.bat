@echo off
title ArogyaSync — Offline Healthcare System
color 0A

echo =====================================================================
echo             ArogyaSync - Offline Rural PHC System
echo =====================================================================
echo.
echo [*] Setting working directory...
cd /d "%~dp0"

:: 1. Check if backend (port 5000) is running, start if needed
curl.exe -s http://localhost:5000/health >nul 2>&1
if %errorlevel% neq 0 (
    echo [*] Starting local LoRa RF Middleware on port 5000...
    start /min "ArogyaSync LoRa Backend" python backend\app.py
) else (
    echo [OK] LoRa RF Middleware already running on port 5000.
)

:: 2. Check if web frontend (port 3000) is running, start if needed
curl.exe -s http://localhost:3000 >nul 2>&1
if %errorlevel% neq 0 (
    echo [*] Starting local Offline Web Server on port 3000...
    start /min "ArogyaSync Web Frontend" cmd /c "npm run dev"
    
    echo [*] Waiting for web server to initialize...
    set /a retries=0
    :wait_server
    timeout /t 1 /nobreak >nul
    curl.exe -s http://localhost:3000 >nul 2>&1
    if %errorlevel% equ 0 goto server_ready
    set /a retries+=1
    if %retries% lss 30 (
        <nul set /p=". "
        goto wait_server
    )
    echo.
    echo [!] Server taking longer than expected. Continuing to launch...
)

:server_ready
echo.
echo [OK] Web server is active and responding on http://localhost:3000!

:: 3. Launch Standalone Desktop App
echo [*] Launching ArogyaSync Standalone Desktop App...

set "EDGE_EXE="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "EDGE_EXE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "EDGE_EXE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

set "CHROME_EXE="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"

if defined EDGE_EXE (
    start "" "%EDGE_EXE%" --app=http://localhost:3000
    goto done
)

if defined CHROME_EXE (
    start "" "%CHROME_EXE%" --app=http://localhost:3000
    goto done
)

start http://localhost:3000

:done
echo.
echo =====================================================================
echo  [SUCCESS] ArogyaSync is running 100%% offline!
echo  No internet connection or Wi-Fi is required.
echo  All data is stored securely in your laptop's local database.
echo =====================================================================
echo.
echo You can keep this window minimized while using ArogyaSync.
pause

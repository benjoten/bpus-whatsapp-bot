@echo off
title BPUS WhatsApp Bot - Local Test Runner
color 0a

echo ========================================================
echo   BHARADWAJ PALLY UNNAYAN SAMITY (BPUS)
echo   WhatsApp Bot Runner (Connected to https://bpus.gt.tc/)
echo ========================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed! Download from https://nodejs.org/
    pause
    exit /b
)

if not exist node_modules (
    echo [INFO] Installing required npm packages...
    call npm install
    echo.
)

echo [INFO] Starting Bot Web Server & WhatsApp Engine...
echo [INFO] Open your browser at: http://localhost:3000/ to view the QR Code!
echo.
start http://localhost:3000/
node bot.js
pause


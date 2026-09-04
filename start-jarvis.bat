@echo off
title JARVIS System Launcher
echo ========================================================
echo               J.A.R.V.I.S. SYSTEM LAUNCHER              
echo ========================================================
echo.
echo Starting Backend Server on http://localhost:3000 ...
start "JARVIS Server" cmd /k "cd /d D:\Jarvis\server && npm run dev"

echo Starting Frontend HUD UI on http://localhost:5173 ...
start "JARVIS UI" cmd /k "cd /d D:\Jarvis\ui && npm run dev"

timeout /t 3 /nobreak >nul
echo Opening J.A.R.V.I.S. in your browser...
start http://localhost:5173/

echo.
echo ========================================================
echo To open on your PHONE or tablet (same Wi-Fi):
echo Look at the JARVIS UI console for the Network URL:
echo e.g. http://192.168.x.x:5173/
echo ========================================================
pause

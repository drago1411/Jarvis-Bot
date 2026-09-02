@echo off
title JARVIS System Launcher
echo ========================================================
echo               J.A.R.V.I.S. SYSTEM LAUNCHER              
echo ========================================================
echo Starting Backend Server on http://localhost:3000 ...
start "JARVIS Server" cmd /k "cd /d D:\Jarvis\server && npm run dev"

echo Starting Frontend HUD UI on http://localhost:5173 ...
start "JARVIS UI" cmd /k "cd /d D:\Jarvis\ui && npm run dev"

echo Opening J.A.R.V.I.S. in your browser...
timeout /t 3 /nobreak >nul
start http://localhost:5173/

echo J.A.R.V.I.S. is running! Keep the minimized console windows open.
pause

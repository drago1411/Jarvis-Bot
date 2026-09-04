@echo off
title JARVIS Global Cloud Tunnel Launcher
echo ========================================================
echo         J.A.R.V.I.S. SECURE CLOUD ACCESS LAUNCHER        
echo ========================================================
echo.
echo Starting Backend Server on http://localhost:3000 ...
start "JARVIS Server" cmd /k "cd /d D:\Jarvis\server && npm run dev"

echo Starting Frontend HUD UI on http://0.0.0.0:5173 ...
start "JARVIS UI" cmd /k "cd /d D:\Jarvis\ui && npm run dev"

timeout /t 3 /nobreak >nul

echo Starting secure Cloudflare public tunnel for mobile/remote access...
echo.
echo ====================================================================
echo Look for the 'https://......trycloudflare.com' URL below.
echo Open that link on your PHONE or any external device!
echo ====================================================================
echo.

npx -y cloudflared tunnel --url http://localhost:5173
pause

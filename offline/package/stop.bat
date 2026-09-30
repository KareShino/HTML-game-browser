@echo off
taskkill /IM html-game-launcher.exe /F >nul 2>&1
echo Stopped.
timeout /t 2 >nul

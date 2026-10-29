@echo off
rem Homunculus 2 - builds the Windows installer (.exe). Author: CLAUDE, 2026-10-28.
rem Double-click it. The first time takes a while (10 to 20 minutes); after that, a few minutes.
rem Public versions are built on GitHub instead (docs/RELEASING.md); this one is for trying a build on this PC.
cd /d "%~dp0"
echo Getting ready...
call npm install --no-audit --no-fund --loglevel=error
if errorlevel 1 goto failed
echo Building the installer (this takes a while; do not close the window)...
call npm run app:build
if errorlevel 1 goto failed
echo.
echo Done! The installer is in the folder that opens now (file Homunculus_..._x64-setup.exe).
echo Double-click it to install or update. Your chats and characters are kept.
explorer "%~dp0apps\desktop\src-tauri\target\release\bundle\nsis"
pause
exit /b 0
:failed
echo.
echo Something went wrong. Take a screenshot of this window and send it to Claude.
pause
exit /b 1

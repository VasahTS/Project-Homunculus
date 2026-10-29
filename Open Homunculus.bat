@echo off
rem Homunculus 2 - opens the app from the code (always the newest version). Author: CLAUDE, 2026-10-28.
rem Double-click this file. It installs whatever is missing (quick when nothing changed) and opens the app.
cd /d "%~dp0"
echo Getting Homunculus ready (this only takes long when the code changed)...
call npm install --no-audit --no-fund --loglevel=error
if errorlevel 1 (
  echo.
  echo Something went wrong while installing. Take a screenshot of this window and send it to Claude.
  pause
  exit /b 1
)
echo Opening Homunculus... (keep this window open while you use the app; closing it closes the app)
call npm run app
if errorlevel 1 pause

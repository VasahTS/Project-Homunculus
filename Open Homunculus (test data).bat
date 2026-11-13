@echo off
rem Homunculus 2 - opens the app from the code with a SEPARATE, empty data folder ("test-data" next to this file).
rem For trying risky things (a whole SillyTavern import, linked folders) without touching your usual data.
rem Your usual data, chats and API keys are not read or changed. Delete the "test-data" folder to start over.
rem Author: CLAUDE, 2026-11-13.
cd /d "%~dp0"
set "HOMUNCULUS_DATA=%~dp0test-data"
if not exist "%HOMUNCULUS_DATA%" mkdir "%HOMUNCULUS_DATA%"
echo Using the TEST data folder: %HOMUNCULUS_DATA%
echo Getting Homunculus ready (this only takes long when the code changed)...
call npm install --no-audit --no-fund --loglevel=error
if errorlevel 1 (
  echo.
  echo Something went wrong while installing. Take a screenshot of this window and send it to Claude.
  pause
  exit /b 1
)
echo Opening Homunculus with test data... (keep this window open while you use the app; closing it closes the app)
call npm run app
if errorlevel 1 pause

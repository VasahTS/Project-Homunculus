@echo off
rem Homunculus 2 - builds the portable version (the one to play with). Author: CLAUDE, 2026-10-29 (D-030, D-038).
rem Double-click it. The first time takes a while (10 to 20 minutes); after that, a few minutes.
rem Result: the folder "Homunculus Portable" in here, WITHOUT any data (just the program).
rem  - First time: move that folder OUT of the project folder (e.g. to Documents) and open Homunculus.exe.
rem  - Later: run this file again, then click "Update Homunculus.bat" inside YOUR play folder.
rem Claude only sees the project folder; your play folder, outside it, Claude does not see.
cd /d "%~dp0"
set "DEST=%~dp0Homunculus Portable"
if exist "%DEST%\data" goto hasdata
echo Getting ready...
call npm install --no-audit --no-fund --loglevel=error
if errorlevel 1 goto failed
echo Building the program (this takes a while; do not close the window)...
call npm run app:portable
if errorlevel 1 goto failed
if not exist "%DEST%" mkdir "%DEST%"
copy /y "apps\desktop\src-tauri\target\release\homunculus.exe" "%DEST%\Homunculus.exe" >nul
if errorlevel 1 goto failed
copy /y "scripts\portable\portable.txt" "%DEST%\portable.txt" >nul
copy /y "scripts\portable\Update Homunculus.bat" "%DEST%\Update Homunculus.bat" >nul
> "%DEST%\source.txt" echo %DEST%\Homunculus.exe
rem Bridge for play folders made before D-038: their old update script reads the program from the folder's
rem old (Portuguese) name. Keep a copy there, plus the new update script, until the play folder uses the new one.
set "OLDDEST=%~dp0Homunculus Portatil"
if not exist "%OLDDEST%" goto done
copy /y "%DEST%\Homunculus.exe" "%OLDDEST%\Homunculus.exe" >nul
copy /y "%DEST%\Update Homunculus.bat" "%OLDDEST%\Update Homunculus.bat" >nul
copy /y "%DEST%\source.txt" "%OLDDEST%\source.txt" >nul
:done
echo.
echo Done! The new program is in the folder that opens now.
echo  - First time: move the "Homunculus Portable" folder out of here and open Homunculus.exe.
echo  - Already have your play folder? Click "Update Homunculus.bat" inside it.
explorer "%DEST%"
pause
exit /b 0
:hasdata
echo The "Homunculus Portable" folder in here already has your data in it.
echo Move that folder out of the project folder before you continue.
pause
exit /b 1
:failed
echo.
echo Something went wrong. Take a screenshot of this window and send it to Claude.
pause
exit /b 1

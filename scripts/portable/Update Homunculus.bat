@echo off
rem Homunculus 2 - updates THIS folder with the newest program. Author: CLAUDE, 2026-10-29 (D-030, D-038).
rem Only Homunculus.exe is replaced. The "data" folder (characters, chats, keys) is not touched.
rem Where the new program comes from: the path written in source.txt (the project folder).
cd /d "%~dp0"
set "LIST=%~dp0source.txt"
if not exist "%LIST%" set "LIST=%~dp0origem.txt"
if not exist "%LIST%" goto nosource
set /p NEW=<"%LIST%"
if not exist "%NEW%" goto nonew
tasklist /fi "imagename eq Homunculus.exe" 2>nul | find /i "Homunculus.exe" >nul
if not errorlevel 1 goto running
if exist "%~dp0Homunculus.exe" copy /y "%~dp0Homunculus.exe" "%~dp0Homunculus-previous.exe" >nul
copy /y "%NEW%" "%~dp0Homunculus.exe" >nul
if errorlevel 1 goto failed
echo Updated! You can open Homunculus.exe now.
echo (If something goes wrong, the previous version was kept as Homunculus-previous.exe.)
pause
exit /b 0
:nosource
echo I could not find source.txt in this folder.
pause
exit /b 1
:nonew
echo I could not find the new program at:
echo %NEW%
echo First run "Build portable version.bat" in the project folder.
pause
exit /b 1
:running
echo Homunculus is open. Close the app and click here again.
pause
exit /b 1
:failed
echo Something went wrong while copying. Take a screenshot of this window and send it to Claude.
pause
exit /b 1

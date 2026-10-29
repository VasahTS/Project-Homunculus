@echo off
rem Homunculus 2 - links this folder to GitHub and sets up the automatic updater. Run it ONCE. Author: CLAUDE, 2026-10-29 (D-037).
rem 1) if this folder is not a repository yet: links it to github.com/VasahTS/Project-Homunculus, branch dev (your files stay);
rem 2) creates the key that signs every version (kept in %USERPROFILE%\.homunculus, OUTSIDE the project);
rem 3) puts the public half of the key in the project (tauri.conf.json);
rem 4) copies the secret half and opens the GitHub page where it is stored.
cd /d "%~dp0"
set "KEYDIR=%USERPROFILE%\.homunculus"
set "KEY=%KEYDIR%\updater.key"
set "OLDKEY=%KEYDIR%\chave-atualizacao.key"
set "REPO=https://github.com/VasahTS/Project-Homunculus.git"
if exist "%~dp0.git" goto prepare
set "GIT=git"
where git >nul 2>nul
if not errorlevel 1 goto link
set "GIT="
for /d %%D in ("%LOCALAPPDATA%\GitHubDesktop\app-*") do if exist "%%D\resources\app\git\cmd\git.exe" set "GIT=%%D\resources\app\git\cmd\git.exe"
if not defined GIT goto nogit
:link
echo Linking this folder to GitHub - VasahTS/Project-Homunculus, branch dev ...
"%GIT%" init -q
if errorlevel 1 goto failed
"%GIT%" remote add origin %REPO%
"%GIT%" fetch -q origin
if errorlevel 1 goto failed
"%GIT%" symbolic-ref HEAD refs/heads/dev
"%GIT%" reset -q origin/dev
if errorlevel 1 goto failed
"%GIT%" branch -q --set-upstream-to=origin/dev dev
"%GIT%" checkout -q -- .
rem files with the old Portuguese names (D-038), replaced by the English ones that just arrived
for %%F in ("Abrir Homunculus.bat" "Criar instalador.bat" "Criar versao portatil.bat" "Preparar atualizador.bat" "PASSAGEM.md" "REGISTRO-CODEX.md" "docs\PUBLICAR.md" "docs\TESTAR.md" "docs\drafts\homepage\LEIA-ME.md" "docs\drafts\homepage-motion\LEIA-ME.md" "docs\drafts\homepage-motion\PLANO-CODEX.md") do if exist %%F del /q %%F
if exist "scripts\portatil" rmdir /s /q "scripts\portatil"
if exist "scripts\github" rmdir /s /q "scripts\github"
echo Done: this folder is now the repository, on branch dev.
:prepare
echo Getting ready...
call npm install --no-audit --no-fund --loglevel=error
if errorlevel 1 goto failed
if not exist "%KEY%" if exist "%OLDKEY%" ren "%OLDKEY%" "updater.key"
if not exist "%KEY%.pub" if exist "%OLDKEY%.pub" ren "%OLDKEY%.pub" "updater.key.pub"
if exist "%KEY%" goto haskey
if not exist "%KEYDIR%" mkdir "%KEYDIR%"
echo Creating the signing key...
call npm run tauri -w @homunculus/desktop -- signer generate --ci -w "%KEY%"
if errorlevel 1 goto failed
goto write
:haskey
echo The key already exists at %KEY% - using it.
:write
call node scripts\release\updater-key.mjs "%KEY%.pub"
if errorlevel 1 goto failed
type "%KEY%" | clip
echo.
echo ================================================================
echo  The SECRET key was copied. On the GitHub page that opened:
echo    Name:    TAURI_SIGNING_PRIVATE_KEY
echo    Secret:  Ctrl+V  and then the "Add secret" button
echo.
echo  IMPORTANT: keep a copy of the folder
echo    %KEYDIR%
echo  on a USB stick or in the cloud. Without it, people who already
echo  installed the app stop getting automatic updates.
echo ================================================================
echo.
echo Then, in GitHub Desktop: File - Add local repository - this folder.
echo Write "Set up the updater", Commit to dev and Push origin.
pause
exit /b 0
:nogit
echo I could not find Git. Open GitHub Desktop once and run this file again,
echo or send a screenshot of this window to Claude.
pause
exit /b 1
:failed
echo.
echo Something went wrong. Take a screenshot of this window and send it to Claude.
pause
exit /b 1

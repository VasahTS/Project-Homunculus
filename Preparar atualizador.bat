@echo off
rem Homunculus 2 - liga esta pasta ao GitHub e o atualizador automatico. Rode UMA vez. Author: CLAUDE, 2026-10-29 (D-037).
rem 1) se a pasta ainda nao e um repositorio: liga ao github.com/VasahTS/Project-Homunculus, na branch dev (os arquivos ficam);
rem 2) cria a chave que assina cada versao (fica em %USERPROFILE%\.homunculus, FORA do projeto);
rem 3) poe a parte publica da chave no projeto (tauri.conf.json);
rem 4) copia a parte secreta e abre a pagina do GitHub onde ela fica guardada.
cd /d "%~dp0"
set "PASTA=%USERPROFILE%\.homunculus"
set "CHAVE=%PASTA%\chave-atualizacao.key"
set "REPO=https://github.com/VasahTS/Project-Homunculus.git"
if exist "%~dp0.git" goto preparar
set "GIT=git"
where git >nul 2>nul
if not errorlevel 1 goto ligar
set "GIT="
for /d %%D in ("%LOCALAPPDATA%\GitHubDesktop\app-*") do if exist "%%D\resources\app\git\cmd\git.exe" set "GIT=%%D\resources\app\git\cmd\git.exe"
if not defined GIT goto semgit
:ligar
echo Ligando esta pasta ao GitHub - VasahTS/Project-Homunculus, branch dev ...
"%GIT%" init -q
if errorlevel 1 goto erro
"%GIT%" remote add origin %REPO%
"%GIT%" fetch -q origin
if errorlevel 1 goto erro
"%GIT%" symbolic-ref HEAD refs/heads/dev
"%GIT%" reset -q origin/dev
if errorlevel 1 goto erro
"%GIT%" branch -q --set-upstream-to=origin/dev dev
"%GIT%" checkout -q -- .
if exist "scripts\github" rmdir /s /q "scripts\github"
echo Pronto: a pasta agora e o repositorio, na branch dev.
:preparar
echo Preparando...
call npm install --no-audit --no-fund --loglevel=error
if errorlevel 1 goto erro
if exist "%CHAVE%" goto temchave
if not exist "%PASTA%" mkdir "%PASTA%"
echo Criando a chave de assinatura...
call npm run tauri -w @homunculus/desktop -- signer generate --ci -w "%CHAVE%"
if errorlevel 1 goto erro
goto gravar
:temchave
echo A chave ja existe em %CHAVE% - vou usar a mesma.
:gravar
call node scripts\release\updater-key.mjs "%CHAVE%.pub"
if errorlevel 1 goto erro
type "%CHAVE%" | clip
echo.
echo ================================================================
echo  A chave SECRETA foi copiada. Na pagina do GitHub que abriu:
echo    Name:    TAURI_SIGNING_PRIVATE_KEY
echo    Secret:  Ctrl+V  e depois o botao "Add secret"
echo.
echo  IMPORTANTE: guarde uma copia da pasta
echo    %PASTA%
echo  num pendrive ou na nuvem. Sem ela, quem ja instalou o app
echo  nao recebe mais atualizacoes automaticas.
echo ================================================================
echo.
echo Depois, no GitHub Desktop: File - Add local repository - esta pasta.
echo Escreva "Liga o atualizador", Commit to dev e Push origin.
pause
exit /b 0
:semgit
echo Nao achei o Git. Abra o GitHub Desktop uma vez e rode este arquivo de novo,
echo ou mande um print desta janela para o Claude.
pause
exit /b 1
:erro
echo.
echo Algo deu errado. Tire um print desta janela e mande para o Claude.
pause
exit /b 1

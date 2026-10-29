@echo off
rem Homunculus 2 - cria o instalador do Windows (.exe). Author: CLAUDE, 2026-10-28.
rem Clique duas vezes. Na primeira vez demora bastante (10 a 20 minutos); depois, alguns minutos.
cd /d "%~dp0"
echo Preparando...
call npm install --no-audit --no-fund --loglevel=error
if errorlevel 1 goto erro
echo Criando o instalador (isto demora; nao feche a janela)...
call npm run app:build
if errorlevel 1 goto erro
echo.
echo Pronto! O instalador esta na pasta que vai abrir agora (arquivo Homunculus_..._x64-setup.exe).
echo Clique duas vezes nele para instalar ou atualizar. Suas sessoes e personagens continuam.
explorer "%~dp0apps\desktop\src-tauri\target\release\bundle\nsis"
pause
exit /b 0
:erro
echo.
echo Algo deu errado. Tire um print desta janela e mande para o Claude.
pause
exit /b 1

@echo off
rem Homunculus 2 - prepara a versao portatil (a "de jogar"). Author: CLAUDE, 2026-10-29 (D-030).
rem Clique duas vezes. Na primeira vez demora bastante (10 a 20 minutos); depois, alguns minutos.
rem Resultado: a pasta "Homunculus Portatil" aqui dentro, SEM dados (so o programa).
rem  - Primeira vez: mova essa pasta para FORA da pasta do projeto (ex.: Documentos) e abra o Homunculus.exe.
rem  - Depois: rode este arquivo de novo e, na SUA pasta de jogo, clique em "Atualizar Homunculus.bat".
rem O Claude so ve a pasta do projeto; a sua pasta de jogo, fora dela, ele nao ve.
cd /d "%~dp0"
set "DEST=%~dp0Homunculus Portatil"
if exist "%DEST%\dados" (
  echo A pasta "Homunculus Portatil" aqui dentro ja tem dados seus.
  echo Mova essa pasta para fora da pasta do projeto antes de continuar.
  pause
  exit /b 1
)
echo Preparando...
call npm install --no-audit --no-fund --loglevel=error
if errorlevel 1 goto erro
echo Criando o programa (isto demora; nao feche a janela)...
call npm run app:portable
if errorlevel 1 goto erro
if not exist "%DEST%" mkdir "%DEST%"
copy /y "apps\desktop\src-tauri\target\release\homunculus.exe" "%DEST%\Homunculus.exe" >nul
if errorlevel 1 goto erro
copy /y "scripts\portatil\portable.txt" "%DEST%\portable.txt" >nul
copy /y "scripts\portatil\Atualizar Homunculus.bat" "%DEST%\Atualizar Homunculus.bat" >nul
> "%DEST%\origem.txt" echo %~dp0Homunculus Portatil\Homunculus.exe
echo.
echo Pronto! O programa novo esta na pasta que vai abrir agora.
echo  - Primeira vez: mova a pasta "Homunculus Portatil" para fora daqui e abra o Homunculus.exe.
echo  - Ja tem a sua pasta de jogo? Clique em "Atualizar Homunculus.bat" dentro dela.
explorer "%DEST%"
pause
exit /b 0
:erro
echo.
echo Algo deu errado. Tire um print desta janela e mande para o Claude.
pause
exit /b 1

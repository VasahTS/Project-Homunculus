@echo off
rem Homunculus 2 - abre o app a partir do codigo (sempre a versao mais nova). Author: CLAUDE, 2026-10-28.
rem Clique duas vezes neste arquivo. Ele instala o que faltar (rapido quando nada mudou) e abre o app.
cd /d "%~dp0"
echo Preparando o Homunculus (so demora quando o codigo mudou)...
call npm install --no-audit --no-fund --loglevel=error
if errorlevel 1 (
  echo.
  echo Algo deu errado ao instalar. Tire um print desta janela e mande para o Claude.
  pause
  exit /b 1
)
echo Abrindo o Homunculus... (pode fechar esta janela depois que o app abrir; ela fecha o app junto)
call npm run app
if errorlevel 1 pause

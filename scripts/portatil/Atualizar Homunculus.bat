@echo off
rem Homunculus 2 - atualiza ESTA pasta com o programa mais novo. Author: CLAUDE, 2026-10-29 (D-030).
rem So troca o Homunculus.exe. A pasta "dados" (personagens, sessoes, chaves) nao e tocada.
rem De onde vem o programa novo: o caminho escrito em origem.txt (pasta do projeto).
cd /d "%~dp0"
if not exist "%~dp0origem.txt" goto semorigem
set /p NOVO=<"%~dp0origem.txt"
if not exist "%NOVO%" goto semnovo
tasklist /fi "imagename eq Homunculus.exe" 2>nul | find /i "Homunculus.exe" >nul
if not errorlevel 1 goto aberto
if exist "%~dp0Homunculus.exe" copy /y "%~dp0Homunculus.exe" "%~dp0Homunculus-anterior.exe" >nul
copy /y "%NOVO%" "%~dp0Homunculus.exe" >nul
if errorlevel 1 goto erro
echo Atualizado! Pode abrir o Homunculus.exe.
echo (Se algo der errado, a versao anterior ficou guardada como Homunculus-anterior.exe.)
pause
exit /b 0
:semorigem
echo Nao achei o arquivo origem.txt nesta pasta.
pause
exit /b 1
:semnovo
echo Nao achei o programa novo em:
echo %NOVO%
echo Rode antes o "Criar versao portatil.bat" na pasta do projeto.
pause
exit /b 1
:aberto
echo O Homunculus esta aberto. Feche o app e clique aqui de novo.
pause
exit /b 1
:erro
echo Algo deu errado ao copiar. Tire um print desta janela e mande para o Claude.
pause
exit /b 1

@echo off
chcp 65001 >nul
title BI Itah
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [ERRO] Node.js nao encontrado.
  echo  Instale a versao LTS em https://nodejs.org e rode este arquivo de novo.
  echo.
  start "" https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules\cookie-session\" (
  echo Instalando dependencias - so na primeira vez...
  call npm install
  if errorlevel 1 (
    echo [ERRO] Falha no npm install. Verifique a internet.
    pause
    exit /b 1
  )
)

if /i "%~1"=="demo" goto demo

if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo.
  echo  Criei o arquivo .env. Preencha DB_USER, DB_PASSWORD e SESSION_SECRET,
  echo  salve e rode este arquivo de novo.
  echo  Dica: rode descobrir-usuario.bat para configurar a tabela de usuarios.
  echo.
  notepad ".env"
  pause
  exit /b 0
)

set "PORTA=3000"
for /f "tokens=1,* delims==" %%a in ('findstr /b /i "PORT=" ".env"') do set "PORTA=%%b"
call :liberar %PORTA%
echo Iniciando BI Itah em http://localhost:%PORTA%  (feche esta janela para parar)
start "" /b cmd /c "timeout /t 3 >nul & start http://localhost:%PORTA%"
node server.js
pause
exit /b 0

:demo
call :liberar 3000
echo Iniciando em MODO DEMO - login: demo / senha: demo
start "" /b cmd /c "timeout /t 3 >nul & start http://localhost:3000"
node server.js --demo
pause
exit /b 0

:liberar
rem Se ja existe um BI Itah (node) rodando nessa porta, fecha ele antes de iniciar de novo
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":%1 .*LISTENING"') do (
  tasklist /fi "PID eq %%p" | find /i "node.exe" >nul && (
    echo Fechando o BI Itah que ja estava aberto ^(PID %%p^)...
    taskkill /PID %%p /F >nul
    timeout /t 1 >nul
  ) || (
    echo [ERRO] A porta %1 esta sendo usada por outro programa ^(PID %%p^).
    echo Troque PORT no arquivo .env, por exemplo PORT=3001.
    pause
    exit
  )
)
exit /b 0

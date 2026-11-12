@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js nao encontrado. Instale em https://nodejs.org & pause & exit /b 1)
if not exist "node_modules\" call npm install
if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo Preencha DB_USER e DB_PASSWORD no .env, salve e rode de novo.
  notepad ".env"
  pause
  exit /b 0
)
node scripts\descobrir-usuario.js %*
echo.
echo Copie as linhas sugeridas acima para o arquivo .env
pause

@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js nao encontrado > diagnostico.txt & echo Node.js nao encontrado & pause & exit /b 1)
if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo.
  echo  Vai abrir o Bloco de Notas: troque DIGITE_A_SENHA_AQUI pela senha do SQL,
  echo  salve com Ctrl+S e feche o Bloco de Notas.
  echo.
  start /wait notepad ".env"
)
if not exist "node_modules\" (
  echo Instalando dependencias...
  call npm install > npm-install.log 2>&1
)
echo Testando banco...
node scripts\diagnostico.js > diagnostico.txt 2>&1
node scripts\explorar.js > explorar.txt 2>&1
type diagnostico.txt
echo.
echo Pronto. Pode fechar esta janela.
pause

@echo off
chcp 65001 >nul
title BI Itah - enviar para o Git
cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [ERRO] Git nao encontrado. Instale em https://git-scm.com/download/win e rode de novo.
  start "" https://git-scm.com/download/win
  pause
  exit /b 1
)

rem ---------- primeira vez: cria o repositorio ----------
if not exist ".git\" (
  echo Criando repositorio Git nesta pasta...
  git init -b main >nul 2>nul || (git init >nul && git checkout -b main >nul 2>nul)
)

rem ---------- nome e e-mail do autor (pergunta so se faltar) ----------
for /f "delims=" %%n in ('git config user.name') do set "GNOME=%%n"
if not defined GNOME (
  set /p "GNOME=Seu nome para os commits: "
  call git config user.name "%%GNOME%%"
)
for /f "delims=" %%e in ('git config user.email') do set "GEMAIL=%%e"
if not defined GEMAIL (
  set /p "GEMAIL=Seu e-mail do GitHub: "
  call git config user.email "%%GEMAIL%%"
)

rem ---------- endereco do repositorio remoto ----------
git remote get-url origin >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Crie um repositorio PRIVADO vazio no GitHub ^(github.com/new^) e cole o endereco aqui.
  echo  Exemplo: https://github.com/seu-usuario/bi-itah.git
  set /p "REMOTO=Endereco do repositorio: "
  call git remote add origin "%%REMOTO%%"
)

rem ---------- seguranca: nunca enviar o .env ----------
git rm --cached .env >nul 2>nul
findstr /x /c:".env" .gitignore >nul 2>nul || echo .env>>.gitignore

rem ---------- commit ----------
echo.
set "MSG="
set /p "MSG=Descricao da alteracao (Enter = data/hora): "
if not defined MSG set "MSG=Atualizacao %date% %time:~0,5%"

git add -A
git commit -m "%MSG%"
if errorlevel 1 echo (nada novo para gravar, vou so enviar)

rem ---------- envio ----------
echo.
echo Enviando para o GitHub...
git push -u origin main
if errorlevel 1 (
  echo.
  echo  [ERRO] Nao consegui enviar. Verifique o endereco do repositorio e o login do GitHub
  echo  ^(na primeira vez abre uma janela para entrar na conta^).
  pause
  exit /b 1
)

echo.
echo  Pronto! Codigo enviado. Se o projeto estiver ligado na Vercel, ela publica sozinha em 1-2 minutos.
pause

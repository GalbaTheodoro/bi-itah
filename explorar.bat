@echo off
chcp 65001 >nul
cd /d "%~dp0"
node scripts\explorar.js > explorar.txt 2>&1

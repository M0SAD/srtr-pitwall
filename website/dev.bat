@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules call npm install --no-audit --no-fund
call npm run app:dev

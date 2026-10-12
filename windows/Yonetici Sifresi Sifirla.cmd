@echo off
rem Optiva - yonetici sifresini sifirlar (Baslat menusundeki kisayol bunu calistirir).
chcp 65001 >nul
title Optiva - Yonetici sifresi sifirlama
set "ROOT=%LOCALAPPDATA%\Optiva"
rem Ad degisikligi: bilgiler henuz tasinmadiysa eski klasor
if not exist "%ROOT%\data\store.db" if exist "%LOCALAPPDATA%\Market Kasa\data\store.db" set "ROOT=%LOCALAPPDATA%\Market Kasa"
set "DB_PATH=%ROOT%\data\store.db"
set "BACKUP_DIR=%ROOT%\backups"
cd /d "%~dp0app"
"%~dp0node\node.exe" tools\users-cli.js reset-password
echo.
pause

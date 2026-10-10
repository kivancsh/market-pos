@echo off
rem Market Kasa - yonetici sifresini sifirlar (Baslat menusundeki kisayol bunu calistirir).
chcp 65001 >nul
title Market Kasa - Yonetici sifresi sifirlama
set "ROOT=%LOCALAPPDATA%\Market Kasa"
set "DB_PATH=%ROOT%\data\store.db"
set "BACKUP_DIR=%ROOT%\backups"
cd /d "%~dp0app"
"%~dp0node\node.exe" tools\users-cli.js reset-password
echo.
pause

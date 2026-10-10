@echo off
rem Market Kasa - veritabaninin anlik yedegini alir ve yedek klasorunu acar.
chcp 65001 >nul
title Market Kasa - Yedek al
set "ROOT=%LOCALAPPDATA%\Market Kasa"
set "DB_PATH=%ROOT%\data\store.db"
set "BACKUP_DIR=%ROOT%\backups"
if not exist "%DB_PATH%" (
  echo Henuz veri yok. Once Market Kasa programini acin.
  echo.
  pause
  exit /b 1
)
cd /d "%~dp0app"
"%~dp0node\node.exe" tools\backup.js
if not errorlevel 1 explorer "%BACKUP_DIR%"
echo.
pause

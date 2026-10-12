@echo off
rem Optiva - veritabaninin anlik yedegini alir ve yedek klasorunu acar.
chcp 65001 >nul
title Optiva - Yedek al
set "ROOT=%LOCALAPPDATA%\Optiva"
rem Ad degisikligi: bilgiler henuz tasinmadiysa eski klasor
if not exist "%ROOT%\data\store.db" if exist "%LOCALAPPDATA%\Market Kasa\data\store.db" set "ROOT=%LOCALAPPDATA%\Market Kasa"
set "DB_PATH=%ROOT%\data\store.db"
set "BACKUP_DIR=%ROOT%\backups"
if not exist "%DB_PATH%" (
  echo Henuz veri yok. Once Optiva programini acin.
  echo.
  pause
  exit /b 1
)
cd /d "%~dp0app"
"%~dp0node\node.exe" tools\backup.js
if not errorlevel 1 explorer "%BACKUP_DIR%"
echo.
pause

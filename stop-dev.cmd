@echo off
setlocal
title Stop ImageX Development Server
cd /d "%~dp0"
set "PORT=3098"

echo.
echo Stopping the ImageX development server on port %PORT%...
echo.

set "FOUND=0"
for /f "tokens=5" %%P in ('netstat.exe -ano -p tcp ^| findstr.exe /R /C:":%PORT% .*LISTENING"') do (
  set "FOUND=1"
  echo Stopping process %%P...
  taskkill.exe /PID %%P /T /F >nul 2>&1
)

if "%FOUND%"=="0" (
  echo [INFO] No listening process was found on port %PORT%.
) else (
  echo [INFO] ImageX development server stopped.
)
echo.
pause
exit /b 0

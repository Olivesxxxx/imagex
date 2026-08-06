@echo off
setlocal
title ImageX Development Server
cd /d "%~dp0"
set "PORT=3098"

echo.
echo ImageX development server
echo Project: %CD%
echo.

where node.exe >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js was not found in PATH.
  echo Install Node.js, then run this script again.
  goto :failed
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm was not found in PATH.
  echo Check your Node.js installation, then run this script again.
  goto :failed
)

if not exist "node_modules\.bin\vite.cmd" (
  echo [ERROR] Project dependencies are not installed.
  echo Run: npm.cmd install
  goto :failed
)

netstat.exe -ano -p tcp | findstr.exe /R /C:":%PORT% .*LISTENING" >nul
if not errorlevel 1 (
  echo [INFO] Port %PORT% is already in use.
  echo The development site may already be running at:
  echo http://localhost:%PORT%
  echo.
  pause
  exit /b 0
)

echo Starting: http://localhost:%PORT%
echo Press Ctrl+C or close this window to stop the server.
echo.

call npm.cmd run start
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" echo [ERROR] The development server stopped with exit code %EXIT_CODE%.
if "%EXIT_CODE%"=="0" echo Development server stopped.
echo.
pause
exit /b %EXIT_CODE%

:failed
echo.
pause
exit /b 1

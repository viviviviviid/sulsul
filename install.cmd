@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
set "sulsul_result=%errorlevel%"
pause
exit /b %sulsul_result%

$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'login.ps1'
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
# This visible window is specifically for the user's one-time interactive Google sign-in.
Start-Process -FilePath $powershell -WindowStyle Normal -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"' + $script + '"'))

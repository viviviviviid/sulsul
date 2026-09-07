$ErrorActionPreference = 'Stop'
$cfg = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($key in @('GEMINI_API_KEY','GOOGLE_API_KEY','GOOGLE_APPLICATION_CREDENTIALS','GOOGLE_CLOUD_PROJECT','GOOGLE_CLOUD_PROJECT_ID','GOOGLE_GENAI_USE_VERTEXAI','GOOGLE_GEMINI_BASE_URL','GOOGLE_VERTEX_BASE_URL','NODE_OPTIONS')) {
  Remove-Item -LiteralPath ('Env:\' + $key) -ErrorAction SilentlyContinue
}
$env:USERPROFILE = $cfg.profile
$env:APPDATA = Join-Path $cfg.profile 'AppData\Roaming'
$env:LOCALAPPDATA = Join-Path $cfg.profile 'AppData\Local'
Set-Location -LiteralPath $cfg.workspace
$Host.UI.RawUI.WindowTitle = 'Sulsul - Antigravity Google sign-in'
Write-Host 'Connect the Google account with your Google AI Pro / Ultra subscription.' -ForegroundColor Green
Write-Host 'After sign-in completes and the Antigravity prompt appears, type /quit.'
Write-Host 'Translation will run without this window from now on.'
& $cfg.cli

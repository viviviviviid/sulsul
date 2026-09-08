$ErrorActionPreference = 'Stop'
$key = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.sulsul.gemini'
if (Test-Path -LiteralPath $key) {
  $current = (Get-Item -LiteralPath $key).GetValue('')
  $expected = Join-Path $PSScriptRoot 'host\com.sulsul.gemini.json'
  if ($current -eq $expected) { Remove-Item -LiteralPath $key }
}
Write-Host 'Sulsul native host registration removed. Remove the extension in chrome://extensions.'
Write-Host 'Account profiles and cached translations were not deleted.'

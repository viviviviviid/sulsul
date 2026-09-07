param([ValidateSet('protect','unprotect')][string]$Mode)
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Security
  $inputText = [Console]::In.ReadToEnd().Trim()
  if ($inputText.Length -gt 32768) { exit 1 }
  $bytes = [Convert]::FromBase64String($inputText)
  $scope = [Security.Cryptography.DataProtectionScope]::CurrentUser
  if ($Mode -eq 'protect') {
    $result = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, $scope)
  } else {
    $result = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, $scope)
  }
  [Console]::Out.Write([Convert]::ToBase64String($result))
} catch { exit 1 }

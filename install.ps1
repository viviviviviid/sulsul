param([switch]$SkipDownload,[switch]$SkipRegister)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$work = Join-Path $root 'data'

try {
  Write-Host ''
  Write-Host '술술 0.9.0 - Windows 설치' -ForegroundColor Green
  Write-Host '이 폴더 안에 연결 프로그램을 설치합니다. 설치 후에는 폴더를 그대로 보관해 주세요.'
  Write-Host ''
  $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
  if (!$nodeCommand) {
    $nodeCandidates = @(
      (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
      (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe')
    )
    $nodePath = $nodeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  } else { $nodePath = $nodeCommand.Source }
  if (!$nodePath) { throw 'Node.js가 필요합니다. https://nodejs.org/en/download 에서 Windows용 LTS를 설치한 뒤 install.cmd를 다시 실행해 주세요.' }
  $nodeVersion = (& $nodePath --version).TrimStart('v')
  if ($LASTEXITCODE -ne 0 -or ([version]$nodeVersion).Major -lt 22) { throw 'Node.js 버전이 낮습니다. 공식 사이트에서 Windows용 LTS를 설치해 주세요.' }

  Write-Host '[1/2] 이 PC의 연결 환경 준비 중...'
  $setupOutput = & $nodePath (Join-Path $root 'host\setup-runtime.mjs') 2>&1
  if ($LASTEXITCODE -ne 0) { throw ('연결 환경을 만들지 못했습니다. ' + ($setupOutput -join ' ')) }
  $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
  if (!(Test-Path -LiteralPath $compiler)) { $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
  if (!(Test-Path -LiteralPath $compiler)) { throw 'Windows의 .NET Framework 4.x 구성 요소가 필요합니다. Windows 업데이트 후 다시 실행해 주세요.' }
  $compileOutput = & $compiler /nologo /target:winexe /optimize+ ('/out:' + (Join-Path $root 'host\sulsul-host.exe')) (Join-Path $root 'host\Launcher.cs') 2>&1
  if ($LASTEXITCODE -ne 0) { throw ('연결 프로그램을 만들지 못했습니다. ' + ($compileOutput -join ' ')) }

  if (!$SkipRegister) {
    Write-Host '[2/2] Chrome 연결 등록 중...'
    $registryPath = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.sulsul.gemini'
    New-Item -Path $registryPath -Force | Out-Null
    Set-Item -LiteralPath $registryPath -Value (Join-Path $root 'host\com.sulsul.gemini.json')
  }

  Write-Host ''
  Write-Host '설치 완료! 이제 Chrome에 확장 프로그램을 추가해 주세요.' -ForegroundColor Green
  Write-Host '1. Chrome 주소창에 chrome://extensions 입력'
  Write-Host '2. 개발자 모드 켜기 > 압축해제된 확장 프로그램을 로드합니다'
  Write-Host '3. 아래 extension 폴더 선택'
  Write-Host ('   ' + (Join-Path $root 'extension')) -ForegroundColor Cyan
  Write-Host '4. 술술 > ChatGPT 연결'
  Write-Host '5. 공식 ChatGPT 로그인 창에서 로그인'
  Write-Host '6. 술술의 쉽게 읽기 클릭'
  Write-Host ''
  Write-Host '다음부터는 설치 파일이나 터미널을 켜둘 필요가 없습니다.'
  exit 0
} catch {
  Write-Host ''
  Write-Host ('설치하지 못했습니다: ' + $_.Exception.Message) -ForegroundColor Red
  Write-Host '문제를 해결한 뒤 install.cmd를 다시 실행해 주세요.'
  exit 1
}

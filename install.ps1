param([switch]$WithoutAntigravity,[switch]$WithAntigravity,[switch]$SkipDownload,[switch]$SkipRegister)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$work = Join-Path $root 'data'
$runtime = Join-Path $work 'sulsul-agy'

try {
  Write-Host ''
  Write-Host '술술 0.7.0 - Windows 설치' -ForegroundColor Green
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

  if (!(Test-Path -LiteralPath (Join-Path $root 'node_modules\node-pty\package.json'))) {
    $npmPath = Join-Path (Split-Path -Parent $nodePath) 'npm.cmd'
    if (!(Test-Path -LiteralPath $npmPath)) { throw '로그인 실행 환경이 없습니다. Windows 배포 ZIP을 다시 받아 주세요.' }
    Push-Location $root
    try { & $npmPath ci --omit=dev; if ($LASTEXITCODE -ne 0) { throw '로그인 실행 환경 설치 실패' } } finally { Pop-Location }
  }

  if (!$WithoutAntigravity -and !$WithAntigravity -and !$SkipDownload) {
    Write-Host '1. Google 계정으로 연결 (Antigravity 설치)'
    Write-Host '2. API 키 또는 Ollama로 연결 (Antigravity 설치 생략)'
    $choice = Read-Host '연결 방식 선택 [1/2, 기본 1]'
    if ($choice -eq '2') { $WithoutAntigravity = $true }
  }
  if (!$SkipDownload -and !$WithoutAntigravity) {
    Write-Host '[1/3] 공식 Antigravity CLI 다운로드 중...'
    New-Item -ItemType Directory -Path $runtime -Force | Out-Null
    $arch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
    $platform = switch ($arch) { 'AMD64' { 'windows_amd64' }; 'ARM64' { 'windows_arm64' }; default { throw 'Windows x64 또는 ARM64 PC가 필요합니다.' } }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $release = Invoke-RestMethod -Uri ('https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/' + $platform + '.json')
    if (([uri]$release.url).Scheme -ne 'https' -or $release.sha512 -notmatch '^[0-9a-fA-F]{128}$' -or !$release.version) { throw '공식 배포 정보를 확인할 수 없습니다. 잠시 후 다시 실행해 주세요.' }
    $candidate = Join-Path $runtime 'agy-download.exe'
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -UseBasicParsing -Uri $release.url -OutFile $candidate
    if ((Get-FileHash -LiteralPath $candidate -Algorithm SHA512).Hash.ToLowerInvariant() -ne $release.sha512.ToLowerInvariant()) { throw '다운로드 파일 검증에 실패했습니다. install.cmd를 다시 실행해 주세요.' }
    Copy-Item -LiteralPath $candidate -Destination (Join-Path $runtime 'agy.exe') -Force
    Remove-Item -LiteralPath $candidate
    $release | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $work 'agy-release.json') -Encoding UTF8
  }

  Write-Host '[2/3] 이 PC의 연결 환경 준비 중...'
  $setupOutput = & $nodePath (Join-Path $root 'host\setup-runtime.mjs') 2>&1
  if ($LASTEXITCODE -ne 0) { throw ('연결 환경을 만들지 못했습니다. ' + ($setupOutput -join ' ')) }
  $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
  if (!(Test-Path -LiteralPath $compiler)) { $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
  if (!(Test-Path -LiteralPath $compiler)) { throw 'Windows의 .NET Framework 4.x 구성 요소가 필요합니다. Windows 업데이트 후 다시 실행해 주세요.' }
  $compileOutput = & $compiler /nologo /target:winexe /optimize+ ('/out:' + (Join-Path $root 'host\sulsul-host.exe')) (Join-Path $root 'host\Launcher.cs') 2>&1
  if ($LASTEXITCODE -ne 0) { throw ('연결 프로그램을 만들지 못했습니다. ' + ($compileOutput -join ' ')) }

  if (!$SkipRegister) {
    Write-Host '[3/3] Chrome 연결 등록 중...'
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
  Write-Host '4. 술술 > AI 선택 · 설정 > 원하는 AI와 모델 선택'
  Write-Host '5. Google 계정 연결 또는 API 키 입력. Google 로그인 후에는 술술 화면에 인증 코드 붙여넣기'
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

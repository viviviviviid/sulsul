# GitHub 공개와 릴리스

## 처음 공개하기

1. GitHub에 공개 저장소 `sulsul`을 만듭니다. 소스에 README·MIT LICENSE가 있으므로 GitHub 초기 파일 생성 옵션은 비워 두세요.
2. 깨끗한 소스 ZIP의 `sulsul` 폴더를 GitHub Desktop의 **Add local repository**로 추가하고 필요하면 초기화합니다. 계정 파일이 없는지 확인한 뒤 초기 커밋을 만들고 **Publish repository**에서 공개로 발행합니다.
3. README와 Actions의 CI 통과를 확인합니다. Security에서 Private vulnerability reporting을 켜는 것을 권장합니다.

설치 폴더를 그대로 업로드하지 마세요. `npm run package:source`는 공개 허용 목록의 소스만 담습니다. 이 목록은 모든 자격 증명을 검사하는 도구는 아니므로 새 파일의 내용을 검토하세요.

## 버전 배포

1. `package.json`, `package-lock.json`, `extension/manifest.json` 버전을 맞추고 변경 기록·설치 안내를 갱신합니다.
2. `npm ci`, `npm run check`, `npm test`, `npm run test:browser`로 검증합니다.
3. 커밋한 버전에 `v0.6.0`처럼 태그를 붙여 push합니다. 태그와 패키지 버전이 다르면 배포가 실패합니다.
4. Release 워크플로가 Windows와 macOS에서 검증하고 설치 ZIP·확장 ZIP·소스 ZIP·SHA256SUMS를 만들어 **초안 GitHub Release**에 첨부합니다.
5. 초안과 첨부 파일을 검토하고 **Publish release**를 누릅니다. Actions가 비활성화된 포크는 Settings → Actions에서 활성화하세요.

로컬 `npm run package`, `npm run package:source`, `npm run package:extension`으로 Windows·소스·확장 ZIP을 만듭니다. macOS는 ditto, Windows는 PowerShell을 사용합니다. 확장 ZIP의 최상위에 manifest.json이 있으며, 압축을 풀어 개발자 모드에서 로드할 수 있습니다. 스토어에 제출할 때는 대시보드의 실제 확장 ID와 Native Messaging의 allowed_origins도 맞춰야 합니다.

macOS에서 `npm run package:macos`는 현재 빌드 머신 아키텍처의 설치 앱을 만듭니다. 공식 Node.js 24.12.0 아카이브를 SHA-256으로 확인하고 Node와 미리 컴파일한 설치 프로그램을 포함합니다. Codex는 첫 계정 연결 때 공식 npm 레지스트리에서 SHA-512를 검증해 받습니다. 설치 후 데이터는 Application Support에 보관합니다. 앱은 로컬 ad-hoc 서명만 하며 Apple Developer ID 서명·공증은 별도 배포 설정이 필요합니다. 초기 릴리스에는 이 사실을 표시합니다.

Windows ZIP은 소스와 설치 스크립트를 포함합니다. Node.js 설치와 Windows 설치 콘솔은 현재 유지하며, 로그인·번역 연결 프로그램은 콘솔 창 없이 실행됩니다. 실제 ChatGPT 계정 연결은 설치 후 확인합니다.

## 포크의 확장 ID

manifest의 `key`는 공개키이며 비밀키가 아닙니다. 같은 공개키는 같은 확장 ID를 만듭니다. 원본을 대신해서 개인 사용하려면 유지할 수 있습니다.

원본과 동시 설치하거나 독립 제품으로 배포하려면 manifest에서 `key`를 제거하고 설치하여 새 공개키·ID를 생성하세요. `com.sulsul.gemini`를 참조하는 background·setup·install·uninstall·문서도 새 호스트 이름으로 함께 변경해야 원본 등록을 덮어쓰지 않습니다.

Chrome 웹 스토어 공개는 별도 작업입니다. 현재는 개발자 모드의 압축해제된 확장 설치를 제공합니다. [Chrome 배포 방식](https://developer.chrome.com/docs/extensions/how-to/distribute), [Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging).

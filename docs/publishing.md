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
4. Release 워크플로가 Windows에서 설치를 검사하고 ZIP·SHA256SUMS를 만들어 **초안 GitHub Release**에 첨부합니다.
5. 초안과 첨부 파일을 검토하고 **Publish release**를 누릅니다. Actions가 비활성화된 포크는 Settings → Actions에서 활성화하세요.

로컬 `npm run package`, `npm run package:source`로 ZIP을 만들고 수동 첨부해도 됩니다. ZIP 생성은 Windows PowerShell 또는 `pwsh`가 필요합니다. 실행 파일을 동봉하지 않고 사용자 PC에서 런처를 컴파일하며 선택 시 공식 Antigravity를 내려받습니다.

## 포크의 확장 ID

manifest의 `key`는 공개키이며 비밀키가 아닙니다. 같은 공개키는 같은 확장 ID를 만듭니다. 원본을 대신해서 개인 사용하려면 유지할 수 있습니다.

원본과 동시 설치하거나 독립 제품으로 배포하려면 manifest에서 `key`를 제거하고 설치하여 새 공개키·ID를 생성하세요. `com.sulsul.gemini`를 참조하는 background·setup·install·uninstall·문서도 새 호스트 이름으로 함께 변경해야 원본 등록을 덮어쓰지 않습니다.

Chrome 웹 스토어 공개는 별도 작업입니다. 현재는 개발자 모드의 압축해제된 확장 설치를 제공합니다. [Chrome 배포 방식](https://developer.chrome.com/docs/extensions/how-to/distribute), [Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging).

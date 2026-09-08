# 설치와 업데이트

술술은 **Chrome 확장 + 내 PC의 연결 프로그램 + 내 ChatGPT 계정**으로 동작합니다. 별도 웹 서버를 배포하거나 공용 API 키를 준비할 필요가 없습니다. 웹 스토어에서 확장을 설치하는 경우에도 PC 연결 프로그램은 별도로 설치해야 합니다.

## 설치 경로 선택

| 목적 | 확장 설치 | PC 연결 프로그램 | 업데이트 담당 |
| --- | --- | --- | --- |
| 제작자의 스토어 버전 사용 | 스토어 공개 후 제공할 링크에서 설치 | 같은 배포자가 제공한 설치 파일 실행 | 확장은 Chrome, 연결 프로그램은 사용자가 새 설치 파일 실행 |
| 제작자의 ZIP 바로 사용 | Releases의 `extension` 폴더를 개발자 모드로 로드 | Windows 설치 스크립트 또는 Mac 설치 앱 | 사용자가 새 ZIP 설치 후 확장 새로고침 |
| 저장소를 직접 받아 사용·수정 | 소스의 `extension` 폴더를 개발자 모드로 로드 | 소스의 설치 스크립트 실행 | 사용자가 소스 갱신·재설치·확장 새로고침 |
| 내 이름으로 다른 사람에게 배포 | 내 배포물 또는 내 스토어 항목 | 내 확장 ID에 맞는 설치 파일 제공 | 배포자가 릴리스·설치 파일·지원 안내 관리 |

현재 원본 프로젝트는 **Releases ZIP과 소스 설치**를 제공합니다. 스토어 링크는 아직 없으며 아래 스토어 절차는 공개 후 사용할 안내입니다. 직접 재배포하려는 경우 [배포 가이드](publishing.md)를 먼저 확인하세요.

## 공통 준비

- Chrome 120 이상. Linux용 설치 프로그램은 제공하지 않습니다.
- Windows는 Node.js 22 이상이 필요합니다. [Node.js LTS 다운로드](https://nodejs.org/en/download).
- Mac 배포 앱은 macOS 13.5 이상인 Apple Silicon용입니다. Node.js와 개발 도구를 따로 설치하지 않아도 됩니다. 소스 설치에는 Node.js 22 이상이 필요합니다.
- Codex 사용 권한이 있는 본인 ChatGPT 계정과 인터넷 연결이 필요합니다. 계정의 Codex 사용 한도가 적용됩니다. [계정·모델·Fast 설정](providers.md).

## 제작자의 ZIP으로 설치

### Windows

1. [Releases](https://github.com/viviviviviid/sulsul/releases/latest)에서 `Sulsul-Windows-버전.zip`을 내려받고 보관할 폴더에 압축을 풉니다.
2. Node.js를 설치한 뒤 해당 폴더의 `install.cmd`를 실행합니다. 관리자 권한은 필요하지 않습니다.
3. `chrome://extensions`에서 **개발자 모드 → 압축해제된 확장 프로그램 로드**를 누르고 ZIP 안의 `extension` 폴더를 선택합니다.
4. 술술의 **ChatGPT 연결**에서 공식 로그인 창을 열어 로그인합니다.
5. 웹페이지에서 **우클릭 → 술술 번역**으로 동작을 확인합니다.

설치한 폴더는 Chrome이 계속 사용하는 실행 위치입니다. 이동했다면 새 위치에서 `install.cmd`를 다시 실행하고 확장을 다시 로드하세요.

### Mac

1. [Releases](https://github.com/viviviviviid/sulsul/releases/latest)의 `Sulsul-Mac-arm64-버전.zip`을 풀고 `술술 설치.app`을 엽니다.
2. **설치하기**를 누릅니다. 현재 앱에는 Apple Developer ID 서명·공증이 없어 macOS의 실행 확인이 필요할 수 있습니다.
3. `chrome://extensions`에서 개발자 모드를 켜고, 설치 앱의 **폴더 경로 복사**로 확인한 폴더를 압축해제된 확장으로 로드합니다.
4. 술술의 **ChatGPT 연결**에서 로그인하고 웹페이지에서 번역을 확인합니다.

설치 앱은 연결 프로그램과 확장을 `~/Library/Application Support/Sulsul/runtime`에 복사합니다. 이 폴더를 Chrome이 계속 사용합니다.

## 저장소에서 직접 설치

본인 PC에서 쓰기 위해 GitHub 포크나 스토어 등록을 할 필요는 없습니다. 수정본을 본인 저장소에서 관리하려면 먼저 포크하고 해당 저장소를 clone하세요.

```sh
git clone https://github.com/viviviviviid/sulsul.git
cd sulsul
npm ci
```

Windows는 `install.cmd`, Mac은 다음 명령으로 연결 프로그램을 설치합니다.

```sh
bash install.command
```

설치 후 `chrome://extensions`에서 **소스의 `extension` 폴더**를 압축해제된 확장으로 로드하고 ChatGPT를 연결합니다. `npm run package`는 배포 ZIP을 만드는 명령이며 로컬 설치에 필수는 아닙니다.

Mac은 연결 프로그램 소스를 Application Support에 복사합니다. `host/`를 수정했다면 `bash install.command`를 다시 실행해야 실행 중인 연결 프로그램에도 반영됩니다. `extension/` 수정은 Chrome 확장 새로고침으로 반영합니다.

원본 공개키와 연결 이름을 유지하면 원본을 대신하는 설치가 됩니다. 원본과 나란히 쓰거나 독립 제품으로 배포하려면 확장 ID뿐 아니라 연결 이름·데이터 경로도 분리해야 합니다. [포크 배포](publishing.md#독립-포크-배포).

## 스토어에서 설치 — 공개 후

현재 스토어 설치 링크는 없습니다. 배포자가 스토어 항목과 그 ID에 맞는 연결 프로그램을 공개한 뒤 다음 순서로 설치합니다.

1. 이 저장소의 README에서 제공하는 스토어 링크로 확장을 설치합니다. 별도 포크 제품은 해당 배포자의 링크를 사용합니다.
2. **같은 배포자**의 Windows/Mac 연결 프로그램을 설치합니다. 스토어 사용자에게 개발자 모드나 `extension` 폴더 추가는 필요하지 않습니다. 설치 앱이 폴더 로드를 안내하더라도 스토어 확장을 이미 설치했다면 그 단계는 건너뜁니다.
3. 확장에서 **ChatGPT 연결**을 누르고 본인 계정으로 로그인합니다.
4. 웹페이지에서 번역을 확인합니다.

스토어 확장과 ZIP 확장을 중복 설치하지 마세요. 확장 ID가 다른 연결 프로그램은 연결되지 않습니다. 현재 ZIP을 미래 스토어 항목과 호환된다고 가정하지 말고 배포자가 지정한 설치 파일을 사용하세요.

## 업데이트와 설치 경로 전환

읽기를 종료하고 Chrome을 완전히 종료한 뒤 연결 프로그램을 갱신하세요.

| 현재 설치 방식 | 갱신 방법 |
| --- | --- |
| Windows ZIP | 새 ZIP의 파일을 기존 설치 폴더에 덮어쓰고 `install.cmd` 실행 |
| Mac 설치 앱 | 새 Mac ZIP을 풀고 `술술 설치.app` 다시 실행 |
| 소스 | 로컬 수정 사항을 보존한 뒤 `git pull --ff-only`, `npm ci`, 운영체제별 설치 스크립트 실행 |
| 스토어 | 확장은 Chrome이 업데이트. 연결 프로그램 변경이 있는 릴리스는 배포자의 새 설치 파일도 실행 |

Chrome을 다시 열고 ZIP·소스 설치 확장은 `chrome://extensions`에서 **새로고침**합니다. 읽던 웹페이지도 새로고침하세요. 현재 연결 프로그램에는 자체 자동 업데이트 기능이 없습니다.

같은 확장 ID·설치 경로로 업데이트하면 기존 로그인·설정을 유지합니다. **ZIP·소스에서 스토어로 전환하거나 포크 제품으로 바꾸는 경우에는 ID가 같다고 보장하지 않습니다.** 기존 읽기를 종료하고 이전 확장을 제거한 뒤 새 확장과 대응하는 연결 프로그램을 설치하세요. ID가 바뀌면 Chrome에 저장한 번역 캐시·버튼 위치는 자동 이전되지 않습니다. 로그인은 사용한 연결 프로그램의 프로필에 따라 다시 필요합니다.

0.9.0 이전에 다른 AI만 연결했던 사용자는 ChatGPT 연결이 한 번 필요합니다. 이전 제공자의 자료는 자동 삭제하지 않으며 현재 번역에 사용하지 않습니다.

## 문제 해결과 삭제

| 증상 | 확인할 내용 |
| --- | --- |
| 연결 프로그램을 찾지 못함 | 확장과 같은 배포자의 설치 파일을 다시 실행. 소스 Mac은 `bash install.command` 실행 |
| 연결 프로그램 접근이 거부됨 | 확장과 연결 프로그램의 배포 경로가 같은지 확인. 배포자는 스토어 ID·공개키·호스트 등록을 확인 |
| 로그인·모델 오류 | **ChatGPT 설정 → ChatGPT 연결**, 또는 모델을 `default`로 저장 후 **연결 확인** |
| 설정 파일 오류 | Chrome 종료 후 `host/config.json`의 `providerSettings`에 지정된 파일을 다른 이름으로 보관하고 다시 실행 |

연결 확인은 인증 상태만 확인하며 AI 생성 요청을 보내지 않습니다. 오류 보고에는 인증 파일이나 민감한 원문을 첨부하지 마세요. 포크 배포물의 문제는 해당 배포자의 지원 경로를 사용합니다.

삭제하려면 먼저 설정의 **저장된 번역 지우기**를 누르고 Chrome에서 확장을 제거합니다. Windows는 `uninstall.cmd`, Mac 소스 설치는 `bash uninstall.command`로 연결 등록을 제거합니다. Mac 설치 앱 사용자는 `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.sulsul.gemini.json`을 제거합니다.

연결 등록을 제거해도 로그인 프로필은 설치 위치의 `data/accounts/codex/profile`에 남습니다. Mac의 설치 위치는 `~/Library/Application Support/Sulsul/runtime`입니다. 이전 제공자의 로그인 자료·암호화 자료도 자동 삭제되지 않습니다. [데이터 처리](../PRIVACY.md).

# 술술 · Sulsul

**어려운 번역투 대신, 읽던 자리에서 편안한 한국어로.**

술술은 웹페이지의 글을 AI로 자연스럽게 풀어 쓰고, 원래 글이 있던 위치에 보여주는 Chrome 확장입니다. 기술 문서, 뉴스, 게시글, 댓글, 메뉴를 읽을 때 사용할 수 있습니다. AI 제공자와 모델은 사용자가 직접 선택합니다.

현재 **Windows 10/11 및 macOS + Chrome**을 지원하는 초기 버전입니다. MIT 라이선스로 수정·포크·재배포할 수 있습니다. Linux용 설치 프로그램과 Chrome 웹 스토어 배포는 아직 제공하지 않습니다.

## 바로 사용하기

개발 지식이나 GitHub 포크는 필요하지 않습니다.

1. 이 저장소의 **Releases**에서 `Sulsul-Windows-버전.zip`을 내려받아 보관할 폴더에 압축을 풉니다. Releases가 없다면 **Code → Download ZIP**으로 소스를 받아도 설치할 수 있습니다.
2. [Node.js LTS](https://nodejs.org/en/download)를 설치합니다.
3. 술술 폴더의 **`install.cmd`를 더블클릭**합니다. Google 계정 연결을 원하면 `1`, API 키·Ollama를 쓰려면 `2`를 선택합니다. 관리자 권한은 필요하지 않습니다.
4. Chrome 주소창에 `chrome://extensions` 입력 → **개발자 모드** 켜기 → **압축해제된 확장 프로그램을 로드합니다** → 술술의 `extension` 폴더 선택.
5. 술술 팝업의 **AI 선택 · 설정**에서 AI를 고릅니다. Google 계정을 연결하거나 API 키를 입력하고 저장합니다. Ollama는 설치한 로컬 모델을 선택합니다.
6. 읽을 페이지에서 **우클릭 → 술술 번역**을 누릅니다. 술술 팝업의 **쉽게 읽기** 또는 **Alt + Shift + K**도 사용할 수 있습니다.

처음 연결 이후에는 번역할 때 터미널을 켜둘 필요가 없습니다. Chrome이 연결 프로그램을 실행합니다. 설치한 폴더를 이동했다면 `install.cmd`를 다시 실행하세요. 자세한 설명은 [설치안내.txt](설치안내.txt)를 참고하세요.

## macOS에서 시작하기

**macOS 13.5 이상인 Apple Silicon Mac은 Releases의 `Sulsul-Mac-arm64-0.7.1.zip`을 받아 `술술 설치.app`을 여세요.** Node.js와 개발 도구를 따로 설치할 필요가 없습니다. 설치 앱에서 Chrome 확장을 추가할 폴더를 안내합니다. 초기 배포에는 Apple 개발자 서명·공증이 없어 macOS의 실행 확인이 필요할 수 있습니다.

Google 계정 연결은 술술 화면에서 로그인 페이지를 열고 인증 코드를 붙여넣으면 됩니다. 로그인·번역 중 터미널 창은 열리지 않습니다.

아래는 소스에서 직접 설치하는 개발자용 절차입니다. 먼저 `npm ci`를 실행하세요.

Node.js 22 이상과 Apple Command Line Tools가 필요합니다. Command Line Tools가 없다면 터미널에서 `xcode-select --install`로 설치하세요. 술술 폴더에서 다음 명령을 실행합니다.

```sh
bash install.command
```

공식 Mac용 Antigravity CLI를 내려받아 SHA-512를 검증하고 Chrome 연결을 등록합니다. 연결 프로그램과 로그인 프로필은 `~/Library/Application Support/Sulsul/runtime`에 설치합니다. Chrome이 데스크탑 폴더의 실행 파일을 읽지 못하는 macOS 권한 문제를 방지합니다. API 키·Ollama만 사용하려면 `bash install.command --without-antigravity`를 실행하세요.

Chrome의 `chrome://extensions` → 개발자 모드 → **압축해제된 확장 프로그램 로드**에서 `extension` 폴더를 선택합니다. 술술의 **AI 선택 · 설정**에서 Google 계정을 연결하거나 API 키를 저장한 뒤 **연결 테스트**를 실행하세요. Mac 단축키는 **Option + Shift + K**입니다.

폴더 이동이나 Node.js 경로 변경 후에는 설치를 다시 실행하세요. `bash uninstall.command`는 Chrome 연결 등록만 제거합니다. 로그인 프로필·암호화 키 파일과 Keychain의 `com.sulsul.api-keys` 항목은 남습니다. 이를 삭제하면 저장한 API 키를 복호화할 수 없습니다.

## AI 선택

| 연결 방식 | 준비할 것 | 사용량 기준 |
| --- | --- | --- |
| Antigravity | 공식 CLI 설치 + 본인 Google 로그인 | 해당 계정의 Antigravity 이용 조건·한도 |
| Gemini API | Gemini API 키 | Google AI 구독과 별도인 API 한도·요금 |
| OpenAI API | OpenAI API 키 | ChatGPT 구독과 별도인 API 요금 |
| Claude API | Anthropic API 키 | Claude 구독과 별도인 API 요금 |
| Ollama | 실행 중인 Ollama + 내려받은 로컬 모델 | 내 PC의 연산 자원 |

**선택한 AI로만 요청합니다.** 한도·인증·연결 오류가 발생해도 다른 제공자나 유료 API로 자동 전환하지 않습니다. Antigravity 추가 크레딧 사용도 꺼져 있습니다. API 모델은 구조화 JSON 출력을 지원해야 합니다. 기본 모델 ID는 설정에서 바꿀 수 있으며 계정·지역에 따라 접근 가능 여부가 다릅니다. [연결 방식별 설명](docs/providers.md).

## 읽는 동안

- 같은 탭·같은 출처(origin)의 다음 페이지도 자동으로 이어 읽습니다. 다른 출처로 이동하거나 탭·브라우저를 닫으면 종료됩니다.
- 처음에는 오른쪽 아래에 **현재 상태 버튼 하나**가 반투명하게 보입니다. 커서를 올리거나 키보드로 포커스하면 선명해지면서 **원문 · 종료 · 일시중지/이어 읽기**가 펼쳐집니다.
- 버튼을 **드래그해서 놓으면 가까운 화면 모서리에 고정**됩니다. 네 모서리에만 배치할 수 있고, 선택한 위치는 이 PC에 저장되어 다음 페이지에서도 유지됩니다. 드래그 중 **Esc**를 누르면 이동을 취소합니다.
- 오류는 버튼 근처 말풍선에 표시되며 **다시 시도**를 한 번 눌러 재개할 수 있습니다.
- **우클릭 → 술술 번역**은 바로 번역을 시작·재개합니다. AI 설정은 술술 팝업의 **AI 선택 · 설정**에서 엽니다.
- **원문**은 원문으로 되돌리고 일시중지합니다. **일시중지**는 지금 번역된 내용을 유지합니다. **종료**는 원문으로 되돌리고 자동 번역을 끕니다.
- 스크롤로 추가된 게시글과 펼친 댓글도 감지합니다. 링크·코드·버튼 구조를 유지하며 텍스트 노드만 교체합니다.
- 현재 화면의 글을 작은 묶음으로 우선 요청합니다. 전체 탭에서 최대 네 요청을 동시에 실행하고 먼저 끝난 번역부터 표시합니다.
- AI 설정을 저장하면 기존 읽기가 일시중지됩니다. **이어 읽기**를 누르면 새 설정으로 번역합니다.

PDF, 이미지 속 글자, iframe 내부 페이지, 입력·편집 중인 영역은 대상이 아닙니다. 매우 긴 항목은 원문으로 남습니다. 사이트가 텍스트를 특수하게 그리거나 계속 덮어쓰면 일부가 번역되지 않을 수 있습니다. Chrome 기본 번역과 동시에 켜지 않는 것을 권장합니다.

## 개인정보

술술 자체 서버나 공유 API 키는 없습니다. 번역 대상 텍스트, 주변 문맥, 페이지 제목·주소는 선택한 AI에 전달됩니다. API 키는 Windows DPAPI 또는 macOS Keychain에 보관한 암호화 키로 보호해 PC에 보관하며 Chrome 동기화 저장소에 넣지 않습니다. Google 로그인은 공식 Antigravity가 관리합니다. [데이터 처리 설명](PRIVACY.md).

설치 후 생긴 `data/`, `host/config.json`, 로그인 정보는 공유하지 마세요. 배포는 아래 패키지 명령이나 원본 다운로드 ZIP을 사용하세요.

## 포크해서 개발하기

GitHub에서 **Fork**를 눌러 내 저장소로 복사하고 내려받은 뒤 Node.js LTS에서 실행합니다.

```sh
npm ci
npm run check
npm test
npx playwright install chromium
npm run test:browser
```

Node.js 22 이상, 권장 LTS 24입니다. 로그인용 가상 터미널은 `node-pty`를 사용하며 Mac 설치 앱과 Windows 배포 ZIP에 포함됩니다. Playwright는 개발·테스트에만 사용합니다.

Windows 배포 파일과 소스 ZIP은 다음 명령으로 만듭니다. 허용 목록의 파일만 복사하여 설치 기록·계정·키가 섞이지 않게 합니다.

```sh
npm run package
npm run package:source
npm run package:extension
# macOS에서 실행: npm run package:macos
```

결과는 `dist/`에 생성됩니다. [기여 가이드](CONTRIBUTING.md), [구조 설명](docs/architecture.md), [GitHub 공개·릴리스 가이드](docs/publishing.md).

## 검증 범위

자동 테스트는 AI별 요청·응답 형식, 키 저장, 한도 오류, 취소, 제공자 변경, 다중 게시글·댓글, Shadow DOM, 동적 로딩, 원문 복원, 페이지 이동을 확인합니다. API 테스트는 가짜 응답과 로컬 HTTP 서버를 사용하며 실제 API 요금을 발생시키지 않습니다. 실제 번역 품질·모델 접근 권한은 설정 화면의 **연결 테스트**와 실제 사용으로 확인해야 합니다.

Antigravity 연결과 기술 문서 번역은 개발 PC에서 실제 동작을 확인했습니다. Reddit 홈 실사이트는 자동화 브라우저의 네트워크 접속 제한으로 직접 검증하지 못했고, 피드·댓글·컴포넌트 구조를 재현한 테스트로 확인했습니다.

## 라이선스

[MIT](LICENSE). Antigravity·Gemini·OpenAI·Claude·Ollama와 제휴한 제품이 아닙니다. 외부 서비스·모델의 이용 조건과 라이선스는 별도로 적용됩니다. Antigravity 실행 파일은 저장소·ZIP에 포함하지 않으며, 선택한 경우 설치 중 공식 배포처에서 받아 SHA-512를 확인합니다.

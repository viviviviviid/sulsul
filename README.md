# 술술 · Sulsul

**ChatGPT로 웹페이지를 읽던 자리에서 원하는 언어로 자연스럽게 읽으세요.**

문서, 기사, 게시글, 댓글을 페이지 안에서 번역하는 Chrome 확장 프로그램입니다. 링크·강조·코드를 보존하고, 동적으로 추가되는 글도 읽습니다. MIT 오픈소스이며 술술 자체 서버가 없습니다.

설정에서 한국어·영어·일본어·중국어(간체/번체)·스페인어·프랑스어·독일어를 선택할 수 있습니다. 원문 언어는 자동 판단하며 캐시는 목표 언어별로 구분합니다. 설정 UI는 현재 한국어입니다.

## Windows 설치

1. [Releases](https://github.com/viviviviviid/sulsul/releases/latest)에서 Windows ZIP을 내려받아 보관할 폴더에 압축을 풉니다.
2. [Node.js LTS](https://nodejs.org/en/download)를 설치합니다. Node.js 22 이상이 필요합니다.
3. **install.cmd**를 더블클릭합니다. 관리자 권한은 필요하지 않습니다.
4. Chrome 주소창에 **chrome://extensions** 입력 → 개발자 모드 → 압축해제된 확장 프로그램 로드 → **extension** 폴더 선택.
5. 술술의 **ChatGPT 연결**을 누르고 공식 로그인 창에서 로그인합니다. 공식 Codex 연결 프로그램은 첫 연결 때 다운로드하고 검증합니다.
6. 읽을 페이지에서 **우클릭 → 술술 번역**을 누릅니다.

다음부터는 터미널이나 설치 파일을 켜둘 필요가 없습니다. Chrome이 필요할 때 연결 프로그램을 실행합니다. 설치한 폴더는 이동하거나 삭제하지 마세요.

## Mac 설치

macOS 13.5 이상인 Apple Silicon Mac은 Releases의 **Sulsul-Mac-arm64** ZIP을 풀고 **술술 설치.app**을 여세요. Node.js와 개발 도구는 따로 필요하지 않습니다. 설치 창에서 안내하는 폴더로 Chrome 확장을 추가한 뒤 **ChatGPT 연결**을 누르세요.

초기 Mac 설치 앱에는 Apple 개발자 서명·공증이 없어 macOS의 실행 확인이 필요할 수 있습니다. Chrome 웹 스토어 버전은 아직 없습니다.

소스에서 직접 설치하려면 Node.js 22 이상을 설치하고 다음을 실행하세요.

```sh
npm ci
bash install.command
```

연결 프로그램은 ~/Library/Application Support/Sulsul/runtime에 설치됩니다. Chrome 확장으로는 소스의 extension 폴더를 선택하세요. bash uninstall.command는 Chrome 연결 등록을 제거하고 로그인 데이터는 남깁니다.

## ChatGPT 연결과 사용 한도

ChatGPT 계정으로 공식 Codex에 로그인하며 **해당 계정의 Codex 이용 한도**가 적용됩니다. ChatGPT 대화의 남은 횟수를 그대로 가져오는 기능은 아닙니다. 계정에서 Codex 사용 권한이 있어야 합니다. 로그인 직후 연결 확인도 짧은 예문 번역 한 번을 포함합니다.

기본 모델은 계정 기본값인 default입니다. **ChatGPT 설정 → 모델 설정**에서 계정이 이용할 수 있는 Codex 모델 ID로 변경할 수 있습니다. 별도 API 키 연결이나 유료 API 자동 전환은 제공하지 않습니다. [연결 설명](docs/providers.md).

## 읽는 방법

- 첫 팝업에서 단축키 사용 여부를 선택하세요. Chrome 설정에서 **술술 실행**에 **Alt + Shift + S**를 배정하는 것을 권장합니다. 다른 확장과 겹치면 다른 키를 선택하세요. 다시 눌러도 번역을 멈추지 않습니다.
- 우클릭 → 술술 번역 또는 팝업의 번역 시작을 누르세요. 기존에 배정한 단축키도 유지됩니다.
- 한 번 켜면 같은 탭·같은 사이트의 다음 페이지도 자동으로 번역합니다.
- 작은 반투명 버튼에 커서를 올리면 **원문·일시중지·종료**가 나타납니다. 드래그하면 네 모서리로 옮길 수 있습니다.
- 오류가 나면 오류 안내와 다시 시도 버튼이 표시됩니다. 번역에 실패한 문단은 원문을 유지합니다.
- PDF·이미지·iframe·입력창은 번역하지 않습니다. Chrome 기본 번역은 끄고 사용하세요.

## 업데이트

새 ZIP의 같은 이름 파일을 기존 설치 폴더에 덮어쓰고 설치 프로그램을 다시 실행하세요. Chrome 확장 목록에서 술술의 새로고침 버튼을 누르고 읽던 웹페이지도 새로고침하세요.

0.9.0부터 ChatGPT만 지원합니다. 이전에 다른 AI를 골랐어도 ChatGPT로 전환됩니다. 기존 Codex 로그인과 모델 설정은 유지됩니다. 이전 제공자의 로그인 자료는 자동 삭제하지 않지만 사용하지 않습니다. 다른 AI만 연결했던 사용자는 ChatGPT 연결이 한 번 필요합니다.

## 개인정보

번역 대상 텍스트, 주변 문맥, 페이지 제목·주소는 OpenAI로 전달됩니다. 인증은 이 PC의 공식 Codex가 관리하며 확장은 비밀번호나 토큰을 받지 않습니다. 번역 결과는 Chrome 프로필에 저장하고 설정에서 지울 수 있습니다. [개인정보 안내](PRIVACY.md).

## 개발·포크

```sh
git clone https://github.com/viviviviviid/sulsul.git
cd sulsul
npm ci
npm run check
npm test
npx playwright install chromium
npm run test:browser
```

실행에는 Node.js만 필요하며 Playwright는 브라우저 테스트에 사용합니다. 자동 테스트는 모의 응답으로 로그인 상태, 번역 구조, 설정 전환, 취소, 캐시, 원문 복원과 페이지 이동을 검증합니다. 실제 계정 접근과 번역 품질은 로그인 후 확인하세요.

Windows에서 npm run package는 설치 ZIP, npm run package:source는 소스 ZIP, npm run package:extension은 확장 ZIP을 만듭니다. Mac 설치 앱은 macOS에서 npm run package:macos로 만듭니다. [배포 안내](docs/publishing.md) · [기여 안내](CONTRIBUTING.md).

## 라이선스

[MIT](LICENSE). 술술의 라이선스는 별도로 내려받는 Codex와 해당 서비스의 이용 조건을 대체하지 않습니다.

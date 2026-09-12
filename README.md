# 술술 — AI 웹 번역기

**내 ChatGPT 계정으로, 읽던 웹페이지를 원하는 언어로 자연스럽게.**

문서·기사·게시글·댓글을 원래 자리에서 번역하는 Chrome 확장 프로그램입니다. 링크와 서식을 유지하고, 스크롤하며 만나는 글도 이어서 번역합니다.

[설치 파일 다운로드](https://github.com/viviviviviid/sulsul/releases/latest) · [설치 가이드](docs/installation.md) · [사용 가이드](docs/usage.md)

![본문과 메뉴를 한국어로 번역한 술술 화면](docs/images/reading-translated.png)

예시 문서에 미리 준비한 번역을 적용한 실제 확장 화면입니다.

## 설치하기

Chrome 120 이상과 **Codex를 사용할 수 있는 본인 ChatGPT 계정**이 필요합니다. Chrome 확장과 PC 연결 프로그램을 함께 설치합니다. 아직 Chrome 웹 스토어에는 등록되어 있지 않습니다.

1. [다운로드 페이지](https://github.com/viviviviviid/sulsul/releases/latest)에서 운영체제에 맞는 ZIP을 받아 압축을 풉니다.
2. PC 연결 프로그램을 설치합니다.
   - **Windows:** [Node.js 22 이상](https://nodejs.org/en/download)을 설치한 뒤 `install.cmd`를 실행합니다.
   - **Mac:** Apple Silicon·macOS 13.5 이상에서 `술술 설치.app`을 실행합니다. Node.js는 따로 설치하지 않아도 됩니다.
3. Chrome 주소창에 `chrome://extensions`를 입력하고 **개발자 모드 → 압축해제된 확장 프로그램 로드**를 누릅니다. Windows는 ZIP 안의 `extension` 폴더, Mac은 설치 앱이 안내하는 폴더를 선택합니다.
4. 술술의 **ChatGPT 연결**을 눌러 공식 로그인 화면에서 로그인합니다.

Mac 설치 앱은 아직 Apple 서명·공증을 받지 않아 실행 확인이 필요할 수 있습니다. 자세한 안내와 소스 설치 방법은 [설치 가이드](docs/installation.md)를 참고하세요.

## 읽는 방법

- **시작:** 웹페이지에서 우클릭 → **술술 번역**, 또는 확장 아이콘 → **번역 시작**을 누르세요.
- **계속 읽기:** 같은 탭·사이트의 다음 페이지와 새로 나타나는 글도 자동으로 번역합니다.
- **원문 확인:** 번역된 글자에 커서를 올리면 그 문단의 원문을 볼 수 있습니다.
- **멈추거나 돌아가기:** 페이지 모서리의 술술 버튼에서 **일시중지·원문 보기·종료**를 선택하세요.

설정에서 한국어·영어·일본어·중국어(간체/번체)·스페인어·프랑스어·독일어를 선택할 수 있습니다. 단축키, 버튼 모양, 사용 기록은 [사용 가이드](docs/usage.md)에서 확인하세요.

## 알아두세요

- **이용 한도:** ChatGPT 계정의 **Codex 이용 한도**를 사용합니다. 별도 API 키는 필요하지 않습니다. [연결·모델 설정](docs/providers.md)
- **지원 범위:** PDF·이미지·입력창·다른 페이지가 삽입된 영역(iframe)은 번역하지 않습니다. Chrome 기본 번역은 끄고 사용하세요. Linux용 설치 프로그램은 아직 없습니다.
- **개인정보:** 번역할 글과 짧은 주변 문맥·제목이 OpenAI로 전달됩니다. 로그인 정보는 PC의 공식 Codex가 관리하고, 번역 결과는 Chrome에 저장됩니다. [자세한 안내](PRIVACY.md)

[업데이트·문제 해결](docs/installation.md#업데이트와-설치-경로-전환) · [변경 기록](CHANGELOG.md) · [문제 제보](https://github.com/viviviviviid/sulsul/issues)

---

개발·AI 에이전트: [에이전트 가이드](AGENTS.md) · [기여하기](CONTRIBUTING.md) · [배포하기](docs/publishing.md)

[MIT 오픈소스](LICENSE). 술술은 OpenAI가 제작하거나 제휴한 공식 확장 프로그램이 아닙니다.

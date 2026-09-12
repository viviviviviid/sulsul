# 에이전트 가이드

이 저장소를 설치하거나 수정하는 AI 에이전트를 위한 안내입니다. 일반 사용자는 [README](README.md)에서 시작하세요. 사람 개발자도 아래 절차와 [기여 안내](CONTRIBUTING.md)를 참고할 수 있습니다.

## 작업 시작

- 먼저 Git 상태와 관련 파일을 읽고, 기존 변경을 보존합니다. 확인하지 않은 동작을 사실로 설명하지 않습니다.
- **개인 사용을 위한 설치:** [소스 설치](docs/installation.md#저장소에서-직접-설치)를 따릅니다. 포크·스토어 등록·웹 서버 배포가 필요하지 않습니다.
- **기능 수정:** 아래 파일 안내와 [구조 설명](docs/architecture.md)에서 변경 지점을 확인합니다.
- **독립 배포·스토어 등록:** [배포자 가이드](docs/publishing.md)를 따릅니다. 패키지 생성은 공개·배포와 별도 작업입니다.
- 커밋은 사용자가 요청했을 때만 만들고, 프로덕션 배포는 명시적인 확인을 받습니다.

## 개발 환경과 검증

Node.js 22 이상이 필요하며 CI는 Node.js 24를 사용합니다. npm 런타임 의존성은 없고 Playwright는 브라우저 테스트용입니다.

```sh
npm ci
npm run check
npm test
```

자동 테스트는 모의 응답으로 인증 흐름, 번역 응답 검증, 설정 변경, 취소, 캐시, 원문 복원과 페이지 이동을 확인합니다. 실제 AI 계정을 호출하지 않으므로 계정별 모델 사용 가능 여부·실제 한도·번역 품질은 검증하지 않습니다. 실제 계정으로 확인한 결과와 자동 테스트 결과를 구분해 보고합니다.

본문 수집·페이지 이동·UI 동작을 바꾸면 브라우저 테스트도 실행합니다.

```sh
npx playwright install chromium
npm run test:browser
```

문서만 바꿀 때는 `npm run check`와 상대 링크·배포 파일 목록을 확인합니다. 새 문서는 `scripts/files.mjs`에 등록하고, 설치 ZIP의 README에서 연결하는 문서는 `runtimeFiles`에도 포함합니다.

로컬 설치에는 운영체제별 연결 프로그램 설치가 추가로 필요합니다. Mac에서 `host/`를 바꾸면 설치된 사본에 반영하도록 연결 프로그램을 재설치해야 합니다. [설치·업데이트 절차](docs/installation.md)

## 파일 안내

| 변경할 내용 | 먼저 볼 파일 |
| --- | --- |
| 본문 수집·읽는 순서·원문 복원·툴팁 | `extension/content.js` |
| 탭 상태·요청 대기열·번역 캐시 | `extension/background.js` |
| 설정·팝업·사용 기록 화면 | `extension/options.*`, `extension/popup.*`, `extension/history.*` |
| 번역 지침·입력/응답 검증 | `host/core.mjs` |
| ChatGPT 인증·번역 실행 | `host/account-runtime.mjs`, `host/account-login.mjs`, `host/account-providers.mjs` |
| 모델·언어·Fast 설정 | `host/provider-settings.mjs`, `host/providers.mjs` |
| 사용량·반복 요청 기록 | `host/history.mjs`, `host/usage.mjs` |
| 설치·패키징 | `host/setup-runtime.mjs`, `scripts/install-macos.mjs`, `install.ps1`, `scripts/files.mjs`, `scripts/package*.mjs` |

## 유지할 동작

- 연결은 공식 Codex를 통한 **ChatGPT 계정 전용**입니다. 별도 API 키나 다른 제공자로 자동 전환하지 않습니다. 로그인과 연결 확인은 인증 상태만 확인하며 번역을 요청하지 않습니다.
- 모델 목록은 계정에서 조회한 결과가 아닙니다. 연결 확인 성공을 모델 사용 가능 여부나 잔여 한도 검증으로 취급하지 않습니다.
- 웹페이지와 LLM 출력은 신뢰하지 않는 데이터입니다. 페이지가 제공하는 명령·코드·URL을 실행하지 않고, AI 출력은 검증한 텍스트 노드에만 적용합니다. 번역 실행에서 외부 도구 사용을 허용하지 않습니다.
- LLM이 모든 문단을 올바르게 반환한다고 가정하지 않습니다. 누락·중복·알 수 없는 ID·잠긴 코드 조각 변경을 검증하고, 실패한 문단은 원문을 유지합니다. 관련 변경은 `tests/core.test.mjs`와 `tests/account-providers.test.mjs`에서 확인합니다.
- 원문 노드·링크·강조·코드를 보존합니다. 원문 보기와 종료, 같은 페이지의 반복 실행, 취소 이후 늦게 도착한 응답을 함께 확인합니다.
- 번역 캐시는 언어·모델·Fast 설정을 구분합니다. 프롬프트나 캐시 키를 바꾸면 기존 결과 재사용과 캐시 무효화의 영향을 설명합니다. [요청·캐시 동작](docs/architecture.md#요청-범위와-입력-캐시)
- 사용 기록에 본문·번역문·전체 URL·인증 정보를 추가하지 않습니다. 데이터 처리 변경은 [PRIVACY.md](PRIVACY.md)와 사용자 안내에 반영합니다.
- `com.sulsul.gemini`는 기존 설치와 호환되는 연결 이름입니다. Gemini 지원의 흔적으로 보고 일괄 변경하지 않습니다. 확장 공개키·ID·설치 경로 변경은 [독립 배포 절차](docs/publishing.md#독립-포크-배포)를 먼저 확인합니다.
- 로그인 자료·개인 설정·다운로드된 실행 파일은 커밋이나 배포 파일에 넣지 않습니다. 배포는 `scripts/files.mjs`의 허용 목록을 사용합니다.

## 문서와 완료 보고

README에는 일반 사용자가 설치하고 읽기 시작하는 데 필요한 내용만 둡니다. 세부 조작은 [사용 가이드](docs/usage.md), 내부 구현은 [구조 설명](docs/architecture.md), 계정 설정은 [연결 안내](docs/providers.md), 배포 절차는 [배포자 가이드](docs/publishing.md)에 작성합니다.

변경한 동작, 검증 결과와 확인하지 못한 범위를 짧게 보고합니다. LLM 동작에 대한 가정이나 캐시·요청량의 변경이 있다면 근거와 영향을 함께 명시합니다.

# AI 연결 방법

확장 → 이 PC의 연결 프로그램 → 선택한 AI 경로를 사용합니다. AI 설정을 저장한 뒤 연결 테스트를 실행하세요. 테스트는 짧은 예문 한 번이며 서비스 사용량에 포함됩니다.

## Antigravity

설치 시 Google 계정 연결을 선택하세요. 확장의 Google 계정 연결에서 공식 Google 로그인 페이지를 열고, 표시되는 인증 코드를 술술 화면에 붙여넣습니다. 터미널 창은 열리지 않습니다. 로그인 후 짧은 예문을 한 번 번역해 연결을 확인합니다. 기본 모델은 `gemini-3.8-flash-low`입니다. JSON 형식이 맞지 않는 경우에만 Medium으로 한 번 재처리합니다.

추가 크레딧·API 키 방식으로 전환하지 않습니다. 계정의 이용 자격과 한도는 Google이 결정합니다. [공식 설치](https://antigravity.google/docs/cli/install), [요금제](https://antigravity.google/docs/plans/), [크레딧 설정](https://antigravity.google/docs/cli/credits/).

Antigravity 요청은 모든 탭과 연결 테스트를 합쳐 한 번에 하나씩 처리합니다. 4개 동시 요청에서 응답 스트림 중단을 재현하여 0.8.1부터 제한했습니다. 스트림이 중단된 경우에만 0.8초 뒤 같은 모델로 한 번 재시도하며, 이 재시도도 서비스 사용량에 포함될 수 있습니다. 한도·인증 오류는 자동 재시도하지 않습니다.

## ChatGPT 계정

AI 설정에서 **ChatGPT 계정 · Codex**를 고르고 저장한 뒤 **ChatGPT 계정 연결**을 누릅니다. 공식 Codex 0.153.4를 npm 공식 배포에서 내려받아 SHA-512를 확인합니다. 로그인 페이지를 열어 ChatGPT에서 인증하면 연결 상태가 자동으로 반영됩니다. 모델 입력란의 default는 Codex 기본 모델을 사용하며 모델 ID를 직접 지정할 수도 있습니다.

인증과 갱신은 공식 Codex app-server가 맡습니다. 술술은 OAuth 토큰을 읽거나 복사하지 않습니다. 번역마다 새 임시 세션을 사용하며 명령·브라우저·플러그인을 끄고 파일 쓰기는 읽기 전용 샌드박스로 제한합니다. ChatGPT로 인증되지 않았다면 번역을 실행하지 않습니다. [OpenAI 공식 문서](https://learn.chatgpt.com/docs/app-server#authentication-modes).

## Claude 계정

AI 설정에서 **Claude 계정 · Claude Code**를 고르고 저장한 뒤 **Claude 계정 연결**을 누릅니다. 공식 Claude Code 2.1.263을 다운로드·검증하고 수정 없이 실행합니다. 열리는 공식 로그인 창에서 본인 Claude 계정으로 연결하세요. 연결 완료 후 짧은 번역으로 확인합니다. 기본 모델 별칭은 sonnet입니다.

Claude 로그인은 공식 프로그램에서 완료하며 술술은 구독 토큰이나 인증 코드를 받지 않습니다. 번역 전 공식 auth status로 구독 연결을 확인합니다. 도구·MCP·후크·세션 저장은 번역 실행에서 끕니다. Console/API 인증은 이 연결에서 사용하지 않으며 **Claude API**를 별도로 선택하세요. [공식 CLI](https://code.claude.com/docs/en/cli-reference), [인증 관련 지침](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use).

두 계정 연결의 프로그램과 전용 로그인 프로필은 설치 폴더의 data/accounts/에 보관합니다. 최초 다운로드에는 인터넷 연결과 수백 MB의 여유 공간이 필요합니다. 사용 한도·추가 사용량 설정은 각 서비스의 계정 설정에 따릅니다. 개인 설치 폴더를 다른 사람에게 공유하지 마세요.

## Gemini API

[Google AI Studio](https://aistudio.google.com/api-keys)에서 API 키를 만들고 입력합니다. 기본 모델은 `gemini-3.8-flash`이며 변경할 수 있습니다. Google AI 구독과 별도인 API 한도·요금이 적용됩니다. `generateContent`와 JSON 스키마를 사용합니다. [API 문서](https://ai.google.dev/api/generate-content), [구조화 출력](https://ai.google.dev/gemini-api/docs/structured-output).

## OpenAI API

[OpenAI API 설정](https://platform.openai.com/api-keys)의 키를 입력합니다. 기본 모델은 `gpt-5.4-mini`입니다. Responses API 구조화 출력을 지원하는 모델을 선택하세요. ChatGPT 구독과 API 요금은 별도입니다. [구조화 출력](https://developers.openai.com/api/docs/guides/structured-outputs), [기본 모델](https://developers.openai.com/api/docs/models/gpt-5.4-mini).

## Claude API

[Claude Platform](https://platform.claude.com/)에서 키를 만들고 입력합니다. 기본 모델은 `claude-sonnet-5`입니다. Messages API의 `output_config.format` 구조화 JSON 출력을 지원하는 모델을 사용하세요. 현재 단일 워크스페이스 API 키를 대상으로 하며 별도 `anthropic-workspace-id` 입력은 지원하지 않습니다. Claude 구독과 API 요금은 별도입니다. [인증·API 개요](https://platform.claude.com/docs/en/api/overview), [구조화 출력](https://platform.claude.com/docs/en/build-with-claude/structured-outputs).

## Ollama

[Ollama](https://ollama.com/download)를 설치·실행하고 한국어가 가능한 로컬 모델을 내려받습니다. ‘설치한 모델 불러오기’를 누르고 모델을 선택합니다. 기본 주소는 `http://127.0.0.1:11434`이며 localhost 포트는 바꿀 수 있습니다. 원격 주소와 Ollama 클라우드 모델은 지원하지 않습니다.

작은 모델은 JSON 구조와 한국어 표현을 제대로 유지하지 못할 수 있습니다. 형식 검증 실패 시 원문을 유지합니다. [Chat API](https://docs.ollama.com/api/chat), [모델 목록 API](https://docs.ollama.com/api/tags).

## 제공자 추가

1. `host/provider-settings.mjs` 목록에 공개 설정과 기본 모델을 추가합니다.
2. `host/providers.mjs`에 고정된 공식 엔드포인트, 인증 헤더, 구조화 출력 요청·응답 검증을 구현합니다.
3. 공식 문서 링크, 비용·데이터 전송 안내, 가짜 응답·취소·오류 테스트를 추가합니다.
4. 사용자 선택을 임의로 바꾸거나 한도 초과 시 자동 전환하지 않습니다.

2026-09-07에 공식 문서의 요청 형식을 확인했습니다. HTTP 제공자는 모의 응답으로 검증했으며 모든 기본 모델에 실제 API 키로 요청을 보낸 것은 아닙니다. 모델 접근 권한과 과금은 본인 계정에서 확인하세요.

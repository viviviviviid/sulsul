# AI 연결 방법

확장 → 이 PC의 연결 프로그램 → 선택한 AI 경로를 사용합니다. AI 설정을 저장한 뒤 연결 테스트를 실행하세요. 테스트는 짧은 예문 한 번이며 서비스 사용량에 포함됩니다.

## Antigravity

설치 시 Google 계정 연결을 선택하세요. 확장의 Google 계정 연결에서 공식 Google 로그인 페이지를 열고, 표시되는 인증 코드를 술술 화면에 붙여넣습니다. 터미널 창은 열리지 않습니다. 로그인 후 짧은 예문을 한 번 번역해 연결을 확인합니다. 기본 모델은 `gemini-3.8-flash-low`입니다. JSON 형식이 맞지 않는 경우에만 Medium으로 한 번 재처리합니다.

추가 크레딧·API 키 방식으로 전환하지 않습니다. 계정의 이용 자격과 한도는 Google이 결정합니다. [공식 설치](https://antigravity.google/docs/cli/install), [요금제](https://antigravity.google/docs/plans/), [크레딧 설정](https://antigravity.google/docs/cli/credits/).

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

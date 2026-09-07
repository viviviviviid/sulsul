# 구조

```text
페이지 텍스트 ↔ content.js ↔ background.js
                                │ Chrome Native Messaging
                          sulsul-host.exe
                                │ stdin/stdout
                            host.mjs
                                │
                         ProviderRouter
                   ┌────────────┴─────────────┐
             Antigravity CLI            HTTP 제공자
             공식 Google 로그인       Gemini / OpenAI / Claude / Ollama
```

`content.js`는 렌더링된 텍스트와 열린/닫힌 Shadow DOM을 읽습니다. 링크와 코드 위치를 유지하도록 문단을 텍스트 조각으로 나눕니다. 원문과 적용된 번역을 함께 추적하여 사이트의 변경과 술술 자체 변경을 구별합니다. 번역은 `textNode.data`에만 적용합니다.

`background.js`는 같은 탭·출처의 읽기 세션, 취소, 로컬 캐시, 네이티브 연결을 관리합니다. 페이지에는 제공자 설정이나 키를 주지 않습니다. 설정 저장 시 활성 세션을 먼저 일시중지하고 요청을 취소합니다. 본문의 이전 번역 결과를 비운 뒤 새 설정을 저장합니다.

`ProviderSettings`는 제공자별 모델·암호화 키를 저장하고 공개 가능한 상태만 반환합니다. 키 원문은 익명 파이프로 고정된 PowerShell 스크립트에 전달하여 DPAPI로 암호화합니다. 명령 인자·환경 변수에 키를 넣지 않습니다.

`ProviderRouter`는 한 요청에서 사용할 설정을 고정합니다. 캐시 범위에는 프롬프트 버전, 설정 리비전, 제공자, 모델이 반영됩니다. 설정이 변경된 뒤 도착한 이전 범위의 요청은 거부합니다.

`providers.mjs`는 고정된 HTTP 엔드포인트, JSON 스키마, 종료 사유·응답 크기 검증을 사용합니다. 외부 도구를 제공하지 않으며 오류 본문은 그대로 전달하지 않습니다. HTTP 요청은 자동 재시도하지 않습니다. CLI Flash Low의 JSON 형식 오류만 같은 Antigravity 제공자의 Medium으로 한 번 재시도합니다.

`Launcher.cs`는 Chrome의 파이프를 Node에 연결하는 창 없는 Windows 프로그램입니다. 설치 중 Windows .NET Framework 컴파일러로 생성합니다. 관리자 권한이나 상시 서버는 필요하지 않습니다. 호스트 이름 `com.sulsul.gemini`는 기존 설치 호환성을 위해 유지합니다.

현재 한 네이티브 연결에서 한 번역 요청을 처리합니다. 여러 탭에서 동시에 시작하면 두 번째 요청은 대기 안내 오류를 받을 수 있습니다. 모든 사이트의 DOM과 모델별 한국어 품질을 보장하지 않습니다.

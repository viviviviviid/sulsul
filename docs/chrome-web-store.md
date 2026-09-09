# Chrome 웹 스토어 제출 준비

현재 상태: 제출 전 준비. 기존 확장 ZIP은 개발자 모드 설치용이며 아직 스토어 제출용으로 검증하지 않았습니다.

## 사용자 설치 흐름

1. Chrome 웹 스토어에서 술술 설치.
2. 술술 연결 프로그램을 운영체제에 맞게 내려받아 한 번 설치.
3. 술술에서 ChatGPT 연결을 누르고 OpenAI 공식 화면에서 로그인.
4. 페이지에서 우클릭 → 술술 번역.

Windows의 현재 연결 프로그램은 Node.js 22 이상이 필요합니다. 스토어 등록만으로 이 요구가 없어지지는 않습니다. 연결 후에는 터미널을 켜둘 필요가 없습니다.

## 등록 정보 초안

이름: 술술 — 웹을 편하게

짧은 설명: ChatGPT로 웹페이지를 읽던 자리에서 원하는 언어로 자연스럽게 읽으세요.

상세 설명:

술술은 문서·기사·게시글·댓글을 원래 위치에서 번역하는 Chrome 확장입니다. 한국어, 영어, 일본어, 중국어 간체·번체, 스페인어, 프랑스어, 독일어를 선택할 수 있습니다.

- 본문을 우선 번역하고 링크·강조·코드를 보존합니다.
- 같은 탭·사이트에서 다음 페이지와 새로 나타나는 글을 자동으로 읽습니다.
- 번역 캐시로 반복 요청을 줄입니다.
- 원문 보기, 일시중지, 종료, 버튼 숨기기와 모서리 이동을 제공합니다.

별도 술술 연결 프로그램 설치와 Codex 사용 권한이 있는 ChatGPT 계정이 필요합니다. 계정의 Codex 사용 한도가 적용됩니다. API 키 방식이 아니며 유료 API로 자동 전환하지 않습니다. Windows에서는 Node.js 22 이상이 필요합니다. PDF·이미지·iframe·입력창은 번역하지 않습니다. 설정 화면은 한국어입니다.

술술은 MIT 오픈소스이며 OpenAI의 공식 제품이 아닙니다. 번역 대상 텍스트·주변 문맥·페이지 제목·주소는 공식 Codex를 통해 OpenAI로 전달됩니다.

홈페이지: https://github.com/viviviviviid/sulsul

지원: https://github.com/viviviviviid/sulsul/issues

개인정보 안내: https://github.com/viviviviviid/sulsul/blob/main/PRIVACY.md

## 권한 설명 초안

| 권한 | 사용 목적 |
| --- | --- |
| activeTab | 사용자가 번역을 실행한 탭에 접근합니다. |
| contextMenus | 웹페이지 우클릭 메뉴에 술술 번역을 제공합니다. |
| scripting | 선택한 탭에서 글을 수집하고 번역을 원래 위치에 표시합니다. |
| storage | 번역 캐시와 사용자 설정을 로컬에 저장합니다. |
| nativeMessaging | 로컬 연결 프로그램과 통신해 공식 Codex 로그인과 번역을 수행합니다. |

단일 목적: 사용자가 선택한 웹페이지를 선호하는 언어로 원래 위치에서 읽도록 번역합니다.

데이터 공개에서는 웹사이트 콘텐츠와 번역에 전달하는 페이지 주소를 명시해야 합니다. 자체 서버가 없다는 이유로 데이터 전송이 없다고 표시하지 마세요. 대시보드의 최신 분류와 PRIVACY.md에 맞춰 제출 전에 항목을 확인합니다.

## 제출 전에 남은 작업

- 개발자 계정 등록, 등록비 결제 및 대시보드가 요구하는 계정 확인.
- 128×128 PNG 아이콘을 확장 ZIP에 포함하고 manifest에 등록.
- 440×280 홍보 이미지와 실제 기능 스크린샷 준비.
- 초안 업로드 후 대시보드에서 확장 ID와 공개키 확인.
- 스토어 공개키에 맞게 manifest.key와 연결 프로그램의 허용 ID를 맞추고 설치 묶음 재생성. 현재 setup-runtime은 manifest.key로 ID를 계산하므로 임의로 key만 지우지 않습니다.
- 기존 개발자 모드 설치와 스토어 설치가 충돌하지 않는지 확인.
- 새 Chrome 프로필에서 스토어 확장과 Windows/macOS 연결 프로그램의 설치·로그인·번역 검증.
- 확장과 별도 프로그램 설치 조건, 모델 사용 한도, 데이터 전송을 설명과 개인정보 공개에 일치시킴.
- 심사자에게 연결 프로그램 다운로드 경로, 설치 단계, Codex 계정 요구 사항과 번역 재현 절차 제공. 개인 인증 토큰을 제출하지 않습니다.

확장 내부에서 원격 JavaScript를 실행하지 않는지와, 별도 프로그램을 통해 제공되는 기능도 심사자가 확인할 수 있는지 검토합니다. 스토어 승인은 심사 결과에 따릅니다.

## 공식 자료

- 개발자 등록: https://developer.chrome.com/docs/webstore/register
- 제출 절차: https://developer.chrome.com/docs/webstore/publish
- 이미지 규격: https://developer.chrome.com/docs/webstore/images
- 개인정보 공개: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- 로컬 연결 프로그램: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging

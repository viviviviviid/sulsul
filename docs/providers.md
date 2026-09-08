# ChatGPT 연결

술술 0.9.0부터 ChatGPT 계정 연결만 지원합니다.

ChatGPT 연결을 누르면 고정 버전의 공식 Codex 실행 파일을 npm 공식 레지스트리에서 다운로드하고 SHA-512를 검증합니다. 로그인은 Codex app-server가 제공하는 공식 OAuth 흐름으로 완료합니다. 인증 토큰을 술술 확장에 붙여넣지 않습니다.

ChatGPT 로그인은 계정의 Codex 이용 한도를 사용합니다. ChatGPT 웹 대화의 사용량과 동일하다고 가정하지 마세요. 이용 권한과 한도는 본인 계정에 따릅니다. [공식 인증](https://learn.chatgpt.com/docs/auth) · [공식 앱 연결](https://learn.chatgpt.com/docs/app-server).

모델 기본값 default는 계정 기본 모델입니다. ChatGPT 설정에서 Codex에서 이용 가능한 모델 ID로 바꿀 수 있습니다. 모델을 바꾸면 기존 번역을 원문으로 돌리고 일시중지하며 새 모델 결과를 이전 캐시와 섞지 않습니다.

별도 API 키를 받지 않고 API 인증 상태에서는 번역을 거부합니다. 한도·인증 오류는 자동 재시도하지 않습니다. 연결 확인은 예문 번역 한 번을 포함합니다.

이전 제공자 설정은 읽을 때 ChatGPT로 전환합니다. 이전 로그인 파일은 사용하지 않으며 자동 삭제하지 않습니다. Codex의 전용 프로필은 data/accounts/codex/profile에 유지됩니다.

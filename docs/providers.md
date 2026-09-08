# ChatGPT 연결

술술은 0.9.0부터 ChatGPT 계정 연결만 지원합니다.

ChatGPT 연결을 누르면 고정 버전의 공식 Codex 실행 파일을 npm 공식 레지스트리에서 다운로드하고 SHA-512를 검증합니다. 로그인은 Codex app-server가 제공하는 공식 OAuth 흐름으로 완료합니다. 인증 토큰을 술술 확장에 붙여넣지 않습니다.

ChatGPT 로그인은 계정의 Codex 이용 한도를 사용합니다. ChatGPT 웹 대화의 사용량과 동일하다고 가정하지 마세요. 이용 권한과 한도는 본인 계정에 따릅니다. [공식 인증](https://learn.chatgpt.com/docs/auth) · [공식 앱 연결](https://learn.chatgpt.com/docs/app-server).

**ChatGPT 설정 → 모델 설정**의 기본값 `default`는 계정 기본 모델입니다. 선택 목록에는 GPT-5.6 Luna·Terra·Sol, GPT-6 Astra, GPT-5.3 Codex Spark가 있으며 **직접 입력**으로 다른 Codex 모델 ID를 저장할 수도 있습니다. 이 목록은 계정에서 조회한 결과가 아니므로 **모델 저장 → 연결 확인**으로 사용 가능 여부를 확인하세요.

Fast 모드는 기본적으로 꺼져 있습니다. 켜면 지원되는 모델에서 속도를 높이는 대신 사용량이 더 차감됩니다. 지원 여부와 차감 기준은 [OpenAI Fast 모드 안내](https://learn.chatgpt.com/docs/agent-configuration/speed)를 확인하세요. 번역 요청의 추론 수준은 Fast 설정과 관계없이 `low`입니다.

모델·Fast 설정을 저장하면 진행 중인 번역을 취소하고 기존 번역을 원문으로 돌린 뒤 일시중지합니다. 페이지에서 **이어 읽기**를 눌러 다시 시작하세요. 캐시는 모델·Fast 설정·프롬프트 버전별로 구분하며 같은 설정으로 돌아오면 남아 있는 번역을 재사용합니다.

별도 API 키를 받지 않고 API 인증 상태에서는 번역을 거부합니다. 한도·인증 오류는 자동 재시도하지 않습니다. 연결 확인은 인증 상태만 확인하며 AI 생성 요청을 보내지 않습니다.

이전 제공자 설정은 읽을 때 ChatGPT로 전환하고 기존 Codex 모델·Fast 설정은 유지합니다. 이전 로그인 파일은 사용하지 않으며 자동 삭제하지 않습니다. Codex의 전용 프로필은 설치 위치의 `data/accounts/codex/profile`에 유지됩니다. Mac의 설치 위치는 `~/Library/Application Support/Sulsul/runtime`입니다.

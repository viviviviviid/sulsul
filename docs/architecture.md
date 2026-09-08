# 구조

content.js가 페이지의 텍스트 노드를 수집하고 background.js가 Native Messaging으로 이 PC의 host.mjs에 요청을 보냅니다. 공식 Codex app-server가 ChatGPT 인증과 번역을 처리합니다. 검증된 결과를 텍스트 노드에 적용하여 링크와 서식을 유지합니다.

ProviderSettings는 ChatGPT 모델만 저장하고 이전 제공자 선택을 ChatGPT로 전환합니다. 설정 리비전과 모델·프롬프트 버전으로 캐시 범위를 분리합니다. 이전 제공자의 키를 복호화하거나 사용하지 않습니다.

account-runtime.mjs는 공식 npm 레지스트리에서 고정 버전 Codex를 다운로드하고 SHA-512를 검증합니다. data/accounts/codex/profile을 전용 인증 저장소로 사용합니다. 부모 프로세스의 API 키·인증 토큰·시작 훅은 전달하지 않습니다.

AccountLoginSession은 Codex의 로그인 완료 알림을 기다린 다음 짧은 실제 번역으로 연결을 검증합니다. 사용자가 취소할 수 있고 10분 후 자동 종료합니다. 로그인 URL만 확장에 전달하고 토큰은 전달하지 않습니다.

번역 전 account/read에서 ChatGPT 인증을 확인합니다. 임시·읽기 전용 스레드, 외부 도구 비활성화, JSON 스키마와 문단 검증을 사용합니다. 실패한 문단의 원문은 유지합니다.

Windows Launcher.cs는 Chrome과 Node의 파이프를 연결하며 콘솔 창을 열지 않습니다. macOS는 절대 경로로 Node를 실행하는 스크립트를 사용합니다. 기존 설치 호환성을 위해 Native Messaging 이름 com.sulsul.gemini와 확장 키를 유지합니다. 이 이름은 Gemini 요청을 의미하지 않습니다.

모든 탭은 최대 4개 요청 대기열을 공유합니다. 연결 확인도 같은 용량에 포함됩니다. 탭 중지·이동은 해당 작업만 취소하며 모델 변경은 모든 작업을 취소하고 종료를 기다린 뒤 저장합니다. 취소된 대기 작업은 전송하지 않습니다.

설치·배포는 scripts/files.mjs의 명시적 파일 목록을 사용합니다. 개인 설정·로그인 자료·다운로드된 계정 실행 파일은 배포물에 포함하지 않습니다.

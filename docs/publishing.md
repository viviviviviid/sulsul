# 배포자 가이드

이 문서는 원본 제작자와 포크 배포자를 위한 안내입니다. 내 PC에서 사용하려면 [설치 가이드](installation.md)를 따르세요. 이 저장소는 **Chrome 확장과 PC 연결 프로그램을 함께 제공하는 프로젝트**입니다. 별도 웹 서버를 배포할 필요가 없습니다.

## 배포 방식과 책임

| 목적 | 해야 할 일 |
| --- | --- |
| 원본 소스를 그대로 공유·재배포 | MIT 저작권 고지·라이선스 유지. 원본·수정 여부·배포 출처 표시 권장 |
| 내 PC에서 직접 사용 | 원본 공개키·연결 이름을 유지해 설치. 스토어 업로드 불필요 |
| 독립 제품으로 배포·원본과 함께 설치 | 내 이름·확장 ID·연결 이름·설치 경로·다운로드 및 지원 주소 설정 |
| Chrome 웹 스토어로 배포 | 스토어 확장과 동일한 ID를 허용하는 연결 프로그램 제공. 별도 심사·공개 |

[MIT 라이선스](../LICENSE)는 수정·재배포·상업적 이용을 허용하며 저작권 고지와 라이선스 사본의 유지를 요구합니다. 출처·수정 여부 표시는 사용자가 지원 주체를 알 수 있게 하는 프로젝트 권장사항입니다. 오픈소스 라이선스가 스토어 승인이나 외부 서비스의 브랜드 사용 허가를 대신하지는 않습니다.

배포자는 본인 배포물의 업데이트·문의·개인정보 안내를 관리합니다. 사용자는 본인 계정으로 로그인하며 사용량도 본인 계정에 적용됩니다. 원본 제작자가 독립 포크의 배포물까지 지원한다고 안내하지 마세요.

## 이름과 설명

- 표시명: **술술 — AI 웹 번역기**. 짧은 이름: **술술**. 영문 브랜드: **Sulsul**.
- 설명: **내 ChatGPT 계정으로 웹페이지를 읽던 자리에서 원하는 언어로 자연스럽게 번역합니다.**
- 연결 방식: 공식 Codex를 통한 ChatGPT 계정 인증과 번역. 계정의 Codex 이용 한도 적용.
- 관계 표시: **술술은 OpenAI가 제작하거나 제휴한 공식 확장 프로그램이 아닙니다.**

`for ChatGPT`는 ChatGPT 화면을 위한 확장으로 읽힐 수 있어 이 프로젝트의 공개 이름에는 사용하지 않습니다. 연결 서비스는 설명에 정확히 표기합니다. OpenAI 가이드는 GPT 브랜드와 모델명의 앱 이름 사용을 제한합니다. `for`나 `with`를 붙였다는 이유만으로 허용된다고 해석하지 않습니다. 이는 이 프로젝트의 명명 기준이며, [OpenAI 브랜드 가이드](https://openai.com/brand/)의 구체적인 적용은 공개 시 다시 확인하세요.

## 배포 파일 만들기

Node.js 22 이상에서 다음을 실행합니다. CI는 Node.js 24를 사용합니다.

```sh
npm ci
npm run check
npm test
npx playwright install chromium
npm run test:browser
```

| 명령 | `dist/` 결과물 | 빌드 환경 |
| --- | --- | --- |
| `npm run package` | `Sulsul-Windows-버전.zip` | Windows 또는 macOS |
| `npm run package:source` | `Sulsul-Source-버전.zip` | Windows 또는 macOS |
| `npm run package:extension` | `Sulsul-Extension-버전.zip` | Windows 또는 macOS |
| `npm run package:macos` | `Sulsul-Mac-아키텍처-버전.zip` | macOS, Xcode Command Line Tools |

Windows ZIP은 Node.js를 별도로 설치해야 합니다. Mac 설치 앱은 공식 Node.js 24.12.0을 SHA-256으로 확인해 포함하며 빌드 머신의 아키텍처로 만듭니다. Codex는 배포물에 넣지 않고 첫 계정 연결 때 고정 버전과 SHA-512를 검증해 받습니다.

Mac 앱 파일명은 `술술 설치.app`, ZIP 이름은 `Sulsul-*` 형식입니다. 현재 Mac 앱은 로컬 ad-hoc 서명만 하며 Developer ID 서명·공증을 완료한 배포물이 아닙니다. 다운로드 안내에 이를 표시하세요.

패키지는 [`scripts/files.mjs`](../scripts/files.mjs)의 허용 목록으로 만듭니다. 설치한 작업 폴더를 통째로 압축하지 마세요. `data/`, `host/config.json`, API 키, 로그인 자료, 다운로드한 실행 파일을 배포물에 넣지 않습니다. 허용 목록에 새 파일을 추가할 때도 내용을 확인해야 합니다.

## 독립 포크 배포

같은 소스를 원본 대신 개인적으로 사용한다면 아래 분리가 필요하지 않습니다. 독립 제품을 만들거나 원본과 함께 설치하려는 경우에 적용합니다. 현재 저장소에는 이름 하나만 바꾸면 모든 배포 설정을 분리하는 자동화가 없습니다.

| 설정 | 변경 위치 | 이유 |
| --- | --- | --- |
| 표시명·설명·브랜드 | `extension/manifest.json`, 확장 HTML, 설치 화면, README | 배포 주체와 기능 표시 |
| 확장 공개키·ID | `extension/manifest.json`의 `key` | 원본 확장과 식별자 분리 |
| Native Messaging 이름 | `extension/background.js`, `host/setup-runtime.mjs`, `install.ps1`, `uninstall.ps1`, `scripts/install-macos.mjs`의 `com.sulsul.gemini` | 원본 Chrome 연결 등록 덮어쓰기 방지 |
| Mac 설치·데이터 경로 | `scripts/install-macos.mjs`, `host/Installer.swift`의 `Application Support/Sulsul/runtime` | 원본 실행 파일·로그인·설정 덮어쓰기 방지 |
| Mac 앱 ID·파일명·안내 경로 | `scripts/package-macos.mjs`의 `com.sulsul.installer`, 앱·ZIP 이름·삭제 안내 | 독립 설치 앱 식별과 올바른 삭제 안내 |
| Windows 설치 폴더 | 사용자에게 안내하는 독립 폴더와 ZIP 파일명 | 원본 소스·로그인 폴더와 분리 |
| 다운로드·지원·개인정보 주소 | README, `extension/setup.html`, 설치 안내, 스토어 항목 | 내 배포물과 지원 경로 사용 |

개발자 모드용 새 ID가 필요하면 포크의 `manifest.key`를 제거한 뒤 **배포자의 작업 사본에서 한 번** `node host/setup-runtime.mjs`를 실행하세요. 생성된 공개키를 보존한 소스로 배포물을 만듭니다. 사용자 설치 때마다 키를 새로 생성하지 마세요. 스토어 배포에는 다음 절차의 스토어 공개키를 사용합니다.

호스트 이름·키·경로 변경 후 설치 파일을 다시 만들고 깨끗한 프로필에서 설치·번역·삭제를 확인하세요. 원본과 동시 설치할 경우 둘 다 작동하고 한쪽 제거가 다른 쪽 등록을 지우지 않는지 확인합니다.

## Chrome 웹 스토어 첫 공개

현재 스토어 URL은 등록되어 있지 않으며, 기존 공개키가 미래 스토어 항목과 일치한다고 검증되지 않았습니다. 확장 ZIP 생성과 스토어 출시는 별도 단계입니다.

### 확장 ID와 연결 프로그램 맞추기

1. Chrome Developer Dashboard에 확장 ZIP을 **미공개 항목**으로 업로드합니다.
2. 항목 ID와 **Package → View public key**를 확인하고 그 공개키를 `extension/manifest.json`의 `key`에 반영합니다.
3. 개발자 모드로 로드한 확장의 ID와 스토어 항목 ID가 같은지 확인합니다. [Chrome 공개키 안내](https://developer.chrome.com/docs/extensions/reference/manifest/key).
4. 이 공개키를 포함한 동일 소스로 Windows·Mac 연결 프로그램과 확장 ZIP을 다시 만듭니다. 같은 배포 버전의 설치 파일로 설치합니다.
5. 생성된 `host/config.json`의 `extensionId`, 호스트 매니페스트의 `allowed_origins`, Chrome의 실제 확장 ID가 일치하는지 확인합니다. Mac의 생성 파일은 설치된 `runtime/host`에 있습니다.

[`host/setup-runtime.mjs`](../host/setup-runtime.mjs)는 `manifest.key`에서 ID를 계산해 설정과 `allowed_origins`를 생성합니다. [`host/host.mjs`](../host/host.mjs)도 같은 ID 하나만 허용하므로 **호스트 매니페스트만 손으로 바꾸는 것으로는 충분하지 않습니다.** 키를 맞춘 소스에서 재설치하세요. [Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging).

스토어 ID로 바꾸면 기존 개발자 모드 설치의 ID가 바뀔 수 있습니다. [설치 경로 전환 안내](installation.md#업데이트와-설치-경로-전환)를 릴리스에 포함하세요. 서로 다른 두 ID를 동시에 지원하는 기능은 현재 구현되어 있지 않습니다.

### 스토어 설명과 심사 자료

스토어 소개 첫 부분에 다음 내용을 표시합니다.

> 웹페이지의 글을 읽던 자리에서 원하는 언어로 자연스럽게 번역합니다. 사용하려면 Windows 또는 macOS용 술술 연결 프로그램을 별도로 설치하고 본인 ChatGPT 계정을 연결해야 합니다. 계정의 Codex 이용 한도가 적용됩니다.

제품 아이콘·실제 화면 스크린샷·지원 연락처·연결 프로그램 다운로드 링크와 지원 운영체제를 준비합니다. 현재 `manifest.json`에는 아이콘 설정이 없습니다. 스토어용 아이콘 자산과 매니페스트 설정은 공개 전에 추가해야 합니다. 설명에는 실제 기능·설치 요건을 정확하게 표시합니다. [스토어 등록 정보 요건](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements).

[`PRIVACY.md`](../PRIVACY.md)를 실제 공개 URL로 제공하고 스토어 개인정보 입력란에도 연결합니다. 페이지 텍스트·문맥·제목·주소의 OpenAI 전송, 로컬 캐시, 로그인 처리, 삭제 방법을 코드와 일치시킵니다. 자체 서버가 없다는 이유로 데이터 전송이 없다고 표시하지 않습니다. [데이터 공개 요건](https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements).

심사 설명에는 단일 목적(사용자가 요청한 웹페이지 번역), 각 권한의 용도, 연결 프로그램 설치·로그인·번역 재현 순서를 적습니다. 현재 설치 앱은 개발자 모드 폴더 로드를 안내하므로 스토어 사용자는 그 단계를 건너뛴다는 안내도 포함합니다. 사용자 계정·토큰을 배포 파일에 넣지 않습니다.

대시보드의 스토어 정보·개인정보·배포 설정을 작성하고 검토에 제출합니다. 승인·공개 후 실제 링크와 ID, 대응하는 연결 프로그램 버전을 README·설치 화면·릴리스에 반영합니다. 현재 안내에 임의의 스토어 링크를 만들지 않습니다. [Chrome 공개 절차](https://developer.chrome.com/docs/webstore/publish/).

## GitHub 릴리스와 이후 업데이트

1. `package.json`, `package-lock.json`, `extension/manifest.json`, `host/account-providers.mjs`의 클라이언트 버전과 README·설치 안내·변경 기록을 맞춥니다.
2. 검증 후 커밋한 버전에 패키지 버전과 같은 `vX.Y.Z` 태그를 push합니다.
3. Release 워크플로가 Windows·macOS 검증과 패키징 후 ZIP·소스·확장·SHA256SUMS를 **초안 GitHub Release**에 첨부합니다. 포크에서는 Actions를 활성화해야 실행됩니다.
4. 첨부 파일과 설치 절차를 검토해 GitHub Release를 공개합니다. **이 워크플로는 Chrome 웹 스토어에 업로드하거나 공개하지 않습니다.** 스토어 업데이트는 별도로 제출합니다.

스토어 확장은 Chrome이 업데이트하지만 PC 연결 프로그램은 자동 갱신되지 않습니다. 연결 프로그램 변경이 있는 릴리스에는 호환되는 확장 버전·설치 파일·재설치 방법을 함께 안내합니다. 새 설치, 이전 연결 프로그램 사용자에게 필요한 업데이트 안내, 기존 설정 유지, 설치 경로 전환, 제거 동작을 확인하세요.

포크에서 데이터 처리나 인증 방식을 바꿨다면 개인정보 문서도 실제 동작에 맞추세요.

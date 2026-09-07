#!/bin/bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo 'Node.js 22 이상이 필요합니다. Node.js LTS를 설치한 뒤 다시 실행하세요.' >&2
  exit 1
fi
exec node scripts/install-macos.mjs "$@"

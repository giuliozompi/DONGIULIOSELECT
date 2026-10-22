#!/bin/bash
# Push to GitHub using GITHUB_PERSONAL_ACCESS_TOKEN secret
# Usage: bash scripts/push-github.sh
set +x
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${GITHUB_PERSONAL_ACCESS_TOKEN:-}" ]; then
  echo "❌ GITHUB_PERSONAL_ACCESS_TOKEN non trovato nelle variabili d'ambiente"
  exit 1
fi

node scripts/check-timeweb-compatibility.mjs

# Keep the token out of command arguments, remote URLs and Git diagnostics.
export GIT_ASKPASS="$PWD/scripts/github-askpass.sh"
export GIT_TERMINAL_PROMPT=0
if ! git -c credential.helper="" push \
  "https://github.com/giuliozompi/DONGIULIOSELECT.git" main >/dev/null 2>&1; then
  echo "Push GitHub non riuscito. Verificare accesso e stato del branch; nessun dettaglio riservato viene stampato." >&2
  exit 1
fi
echo "Push GitHub completato."

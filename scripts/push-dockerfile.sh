#!/bin/bash
set +x
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${GITHUB_PERSONAL_ACCESS_TOKEN:-}" ]; then
  echo "GITHUB_PERSONAL_ACCESS_TOKEN non trovato" >&2
  exit 1
fi
# This API write also updates the deployment branch.
node scripts/check-timeweb-compatibility.mjs

TOKEN="$GITHUB_PERSONAL_ACCESS_TOKEN"
REPO="giuliozompi/DONGIULIOSELECT"

# Check if Dockerfile already exists on GitHub
EXISTING_SHA=$(curl -s --connect-timeout 5 --max-time 20 -H "Authorization: token $TOKEN" \
  "https://api.github.com/repos/$REPO/contents/Dockerfile?ref=main" | \
  grep -o '"sha":"[^"]*"' | head -1 | sed 's/"sha":"//;s/"//') || true
echo "existing_sha=$EXISTING_SHA"

# Base64-encode the Dockerfile
ENCODED=$(base64 -w 0 Dockerfile)
echo "encoded_len=${#ENCODED}"

# Build JSON payload
if [ -n "$EXISTING_SHA" ]; then
  PAYLOAD="{\"branch\":\"main\",\"message\":\"Fix: add Dockerfile with npx build to fix vite-not-found\",\"content\":\"$ENCODED\",\"sha\":\"$EXISTING_SHA\"}"
else
  PAYLOAD="{\"branch\":\"main\",\"message\":\"Fix: add Dockerfile with npx build to fix vite-not-found\",\"content\":\"$ENCODED\"}"
fi

if ! RESULT=$(curl --fail --silent --max-time 20 -X PUT \
  -H "Authorization: token $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  "https://api.github.com/repos/$REPO/contents/Dockerfile"); then
  echo "Aggiornamento Dockerfile GitHub non riuscito." >&2
  exit 1
fi
echo "Aggiornamento Dockerfile GitHub completato."

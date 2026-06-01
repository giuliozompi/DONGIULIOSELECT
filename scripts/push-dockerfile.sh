#!/bin/bash
set -e

TOKEN="$GITHUB_PERSONAL_ACCESS_TOKEN"
REPO="giuliozompi/DONGIULIOSELECT"

# Check if Dockerfile already exists on GitHub
EXISTING_SHA=$(curl -s -H "Authorization: token $TOKEN" \
  "https://api.github.com/repos/$REPO/contents/Dockerfile" | \
  grep -o '"sha":"[^"]*"' | head -1 | sed 's/"sha":"//;s/"//')
echo "existing_sha=$EXISTING_SHA"

# Base64-encode the Dockerfile
ENCODED=$(base64 -w 0 Dockerfile)
echo "encoded_len=${#ENCODED}"

# Build JSON payload
if [ -n "$EXISTING_SHA" ]; then
  PAYLOAD="{\"message\":\"Fix: add Dockerfile with npx build to fix vite-not-found\",\"content\":\"$ENCODED\",\"sha\":\"$EXISTING_SHA\"}"
else
  PAYLOAD="{\"message\":\"Fix: add Dockerfile with npx build to fix vite-not-found\",\"content\":\"$ENCODED\"}"
fi

RESULT=$(curl -s -X PUT \
  -H "Authorization: token $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  "https://api.github.com/repos/$REPO/contents/Dockerfile")

echo "$RESULT" | grep -o '"name":"[^"]*"' | head -3
echo "$RESULT" | grep -o '"message":"[^"]*"' | head -1

#!/bin/bash
# Push to GitHub using GITHUB_PERSONAL_ACCESS_TOKEN secret
# Usage: bash scripts/push-github.sh

if [ -z "$GITHUB_PERSONAL_ACCESS_TOKEN" ]; then
  echo "❌ GITHUB_PERSONAL_ACCESS_TOKEN non trovato nelle variabili d'ambiente"
  exit 1
fi

git -c credential.helper="" push "https://giuliozompi:${GITHUB_PERSONAL_ACCESS_TOKEN}@github.com/giuliozombi/DONGIULIOSELECT.git" main

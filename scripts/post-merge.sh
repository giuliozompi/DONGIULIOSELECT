#!/bin/bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Reject non-portable lockfiles before changing the installed dependencies.
node --test tests/deployment-lockfile.test.mjs
npm ci --no-audit --no-fund

# The design preview must not borrow React or Vite from the legacy application.
if [[ -f artifacts/mockup-sandbox/package-lock.json ]]; then
  (
    cd artifacts/mockup-sandbox
    npm ci --workspaces=false --no-audit --no-fund
  )
fi

# Database/schema changes require separate approval, never an automatic merge.

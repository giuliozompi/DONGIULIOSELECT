---
name: GitHub push from Replit
description: How to push to giuliozompi/DONGIULIOSELECT from Replit using GITHUB_PERSONAL_ACCESS_TOKEN
---

# GitHub Push Setup

**Working command:**
```bash
git -c credential.helper="" push "https://giuliozompi:${GITHUB_PERSONAL_ACCESS_TOKEN}@github.com/giuliozombi/DONGIULIOSELECT.git" main
```

**Why:** Must include `giuliozompi:` username before the token in the URL, and `credential.helper=""` to bypass any cached credentials. Without username prefix, git returns "Repository not found" even with valid `repo`-scoped token.

**How to apply:** Use this exact format every time a push to GitHub is needed. Script saved at `scripts/push-github.sh`.

**Note:** `GITHUB_PAT` secret gives 403/not-found — always use `GITHUB_PERSONAL_ACCESS_TOKEN`.

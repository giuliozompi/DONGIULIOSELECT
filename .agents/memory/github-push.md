---
name: GitHub push from Replit
description: How to push to giuliozompi/DONGIULIOSELECT from Replit using GITHUB_PERSONAL_ACCESS_TOKEN
---

# GitHub Push Setup

**Working command:**
```bash
git -c credential.helper="" push "https://giuliozompi:${GITHUB_PERSONAL_ACCESS_TOKEN}@github.com/giuliozompi/DONGIULIOSELECT.git" main
```

**Why:** The owner/repo is `giuliozompi/DONGIULIOSELECT` — note the username is spelled `giuliozompi` (with **mp**), NOT `giuliozombi` (with **mb**). A misspelled owner returns "Repository not found" / 404 on every git push AND every REST API call, even with a valid `repo`-scoped token. Must also include the `giuliozompi:` username before the token in the URL, and `credential.helper=""` to bypass any cached credentials.

**How to apply:** Use this exact format every time a push to GitHub is needed. Script saved at `scripts/push-github.sh`.

**Note:** `GITHUB_PAT` secret gives 403/not-found — always use `GITHUB_PERSONAL_ACCESS_TOKEN`.

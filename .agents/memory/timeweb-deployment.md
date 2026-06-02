---
name: Timeweb Deployment Config
description: Critical Timeweb Apps deployment configuration for this Express+React fullstack app
---

## App Type
Always use **"Другой" (Other)** — not React, not Node.js. React type serves only static frontend without the Express backend.

## Build Command
```
npm install && npx vite build && npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist
```

## Start Command
```
node dist/index.js
```

## Port
The server reads `process.env.PORT` (injected by Timeweb) and defaults to `3000`.
User must also set `PORT=3000` in Timeweb's "Переменные" section as a fallback.

## Required Environment Variables
- `DATABASE_URL` — Neon serverless PostgreSQL connection string
- `PORT` — `3000`
- All other app secrets (YooKassa, Telegram, etc.)

**Why:** Without DATABASE_URL the old code threw at module load time crashing the process before server.listen(). Fixed in db.ts to defer the crash.

## Push to GitHub
Use `bash scripts/push-github.sh` — requires `GITHUB_PERSONAL_ACCESS_TOKEN` secret.
Git commits happen automatically via Replit checkpoints; push script sends committed code to GitHub which triggers Timeweb auto-deploy.

---
name: Timeweb deployment
description: How to correctly deploy this app on Timeweb Cloud
---

## Key facts

- Timeweb generates its OWN Dockerfile (ignores ours partially). Their template injects "Команда сборки" as a final `RUN` step.
- "Директория сборки" MUST be empty (root). If set to `main`, Docker looks for `/main/package.json` which doesn't exist.
- "Команда сборки" MUST be `npm run build` (not `docker-compose build`).
- "Команда запуска" MUST be `pm2 start --no-daemon dist/index.js`.
- DATABASE_URL must use TCP port 5432 with SSL (`?sslmode=require`), NOT Neon's WebSocket endpoint.
- `server/db.ts` uses `import pg from 'pg'` (ESM default import) with `node-postgres`.

**Why:** Timeweb's Docker template has 11 steps, ending with `RUN <Команда сборки>`. docker-compose is not installed in the node:24-slim image.

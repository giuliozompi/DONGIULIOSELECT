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

## Confirm the live database before schema-dependent releases

Verify the database actually configured as `DATABASE_URL` in Timeweb before sending schema-dependent changes to its deployment branch. Do not assume the workspace database, Replit's managed production database, or a secret named `NEON_DATABASE_URL` identifies that target.

**Why:** An available Neon connection and the workspace connection identified different databases. A successful workspace migration therefore did not establish that Timeweb had the required schema.

**How to apply:** Establish the live connection from Timeweb's configuration, inspect schema readiness read-only, and obtain separate authorization before production schema changes. Keep deployment-triggering pushes on hold while the prerequisite remains unverified.

The user supplied `TIMEWEB_DATABASE_URL` specifically for the live Timeweb database of dongiulioselect.ru. This is distinct from the workspace and the previously available Neon connection.

**Why:** The user provided it through the secure secrets flow to identify the database actually used by Timeweb.

**How to apply:** Use that secret only for authorized production work; default to read-only checks and never replace the workspace connection with it.

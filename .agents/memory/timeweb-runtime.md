---
name: Timeweb runtime env
description: Timeweb runs the server without NODE_ENV=production — how to detect prod reliably
---

# Timeweb runtime environment

Timeweb runs the built server with `node dist/index.js` but does **NOT** set
`NODE_ENV=production`. Express's `app.get("env")` therefore defaults to
`"development"`, which made the server fall into the Vite dev branch and serve
the un-bundled dev `index.html` (referencing `/src/main.tsx`) → blank page in
the browser even though the build and deploy succeeded.

**Rule:** Do not gate production behavior on `NODE_ENV` alone for Timeweb.
Detect production by the presence of the compiled client build
(`fs.existsSync(path.resolve(import.meta.dirname, "public"))`). Use the Vite dev
server only when `app.get("env") === "development" && !hasClientBuild`.

**Why:** This is host-independent and needs no manual env-var config (user wants
zero manual steps). In dev (tsx running `server/index.ts`) `import.meta.dirname`
is `server/`, so `server/public` doesn't exist → dev mode. In prod (bundled
`dist/index.js`) it's `dist/`, so `dist/public` exists → static serving.

**How to apply:** Any "am I in production?" decision in server startup on Timeweb
should key off build artifacts, not `NODE_ENV`. Same caution applies to DB/secret
gating — required env vars (e.g. `DATABASE_URL`) must be set in the Timeweb panel;
if missing, `server/db.ts` throws at import and the server never starts (no HTML
served at all, distinct from the blank-page symptom).

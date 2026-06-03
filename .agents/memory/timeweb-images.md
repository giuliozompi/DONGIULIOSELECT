---
name: Image proxy for Timeweb
description: How images from Replit Object Storage are served on Timeweb
---

## Problem
Replit Object Storage uses a sidecar at `http://127.0.0.1:1106` for authentication. This sidecar only exists on Replit's infrastructure. On Timeweb, all `/objects/<uuid>` requests fail.

## Solution
Set env var `REPLIT_OBJECT_PROXY_URL=https://don-giulio-catalog.replit.app` on Timeweb.

The `/objects/` route in `server/routes.ts` detects this env var and proxies the request: fetches the image from Replit via `fetch()`, buffers it, and serves it with `Cache-Control: public, max-age=86400`.

**Why fetch+pipe instead of redirect:** avoids cross-origin redirects, keeps URL on dongiulioselect.ru, browser caches from own domain.

**New image uploads from Timeweb admin:** will also fail (presigned URL generation requires Replit sidecar). Uploads must be done from Replit or a separate admin tool.

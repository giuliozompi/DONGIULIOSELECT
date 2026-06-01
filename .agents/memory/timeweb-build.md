---
name: Timeweb build ignores repo Dockerfile
description: Why build tooling must live in dependencies (not devDependencies) for the Timeweb deploy of DONGIULIOSELECT
---

# Timeweb auto-build behavior

Timeweb (Russian hosting, connected to GitHub giuliozompi/DONGIULIOSELECT) IGNORES the
repo's own Dockerfile and generates its OWN, whose build step is essentially:
`npm install && npx vite build && npx esbuild ... || true`

**Why this bites:** that production-mode install SKIPS `devDependencies`. If
Vite/esbuild/tailwind/postcss/plugins live in devDependencies the frontend build fails
("Cannot find package 'vite'", unresolved @vitejs/plugin-react, @replit/vite-plugin-*).
The trailing `|| true` MASKS the failure ("Build succeeded" is a false positive) and
ships an image with no frontend → blank page.

**Fix (zero manual steps):** keep ALL build-required packages in `dependencies`, not
devDependencies. Needed for this repo's build: vite, @vitejs/plugin-react,
@replit/vite-plugin-runtime-error-modal (+ cartographer, dev-banner referenced via
dynamic import in vite.config.ts), esbuild, tailwindcss, postcss, autoprefixer,
@tailwindcss/typography, typescript. (@tailwindcss/vite is unused; @types/*, drizzle-kit,
tsx can stay in devDependencies.)

**Gotcha:** `installLanguagePackages` will NOT move a package already present in
devDependencies — npm keeps it in its existing section. To recategorize, edit package.json
directly (move the lines) THEN run installLanguagePackages once to resync package-lock.json.
The bash tool blocks dependency-install commands; use the packager to sync the lockfile.
Verify locally with `npm run build` -> expect dist/public + dist/index.js.

**Alternative fix (needs one manual panel click):** in the Timeweb panel set Build type ->
Dockerfile, which makes it use the repo Dockerfile (installs all deps).

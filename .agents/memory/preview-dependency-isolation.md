---
name: Legacy preview dependency isolation
description: Protect the existing npm application when scaffolding an isolated design sandbox.
---

Treat mockup dependency isolation as a runtime requirement, not just a separate source directory.

**Why:** Sandbox scaffolding in this legacy npm project installed through the root package manager. Preview imports resolved to incompatible root packages, while the main server retained stale module references. A strict dependency layout also exposed production-source imports that previously relied on npm's transitive hoisting. The old npm lockfile could not be blindly restored because the package firewall now rejects one of its pinned transitive packages.

**How to apply:** Check where both the preview bundler and React resolve before trusting a preview. Keep preview dependencies local, avoid concurrent root/nested dependency installation, and verify both existing-app startup and rendered sandbox pages after scaffolding. HTTP 200 for a Vite HTML route is not proof that its modules render. Preserve security checks; do not bypass a firewall block to restore an older lockfile, and keep production dependency changes outside design-only approvals.

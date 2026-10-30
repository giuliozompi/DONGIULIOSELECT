---
name: Temporary workflow cleanup
description: Safely remove leftover port mappings after temporary verification workflows.
---

Removing a temporary workflow can leave its automatically added port mapping in
the workspace configuration.

**Why:** A static release-verification workflow left its port exposed after the
workflow itself had been removed.

**How to apply:** Inspect the configuration diff after removing a temporary
workflow. Preserve unrelated mappings. Direct edits to `.replit` are blocked:
prepare the updated TOML in a temporary workspace file and use
`verifyAndReplaceDotReplit({ tempFilePath: absolutePath })` for validated
replacement.

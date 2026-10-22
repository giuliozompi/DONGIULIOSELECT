---
name: Keyboard popups inside dialogs
description: Escape priority for nested suggestions and realistic browser keyboard events.
---

Nested suggestion popups must consume the first Escape before the surrounding dialog handles it; a subsequent Escape should retain the normal dialog behavior.

**Why:** Radix listens for Escape during document capture, so stopping propagation in a React input handler runs too late and can discard an address draft by closing its dialog.

**How to apply:** Account for capture-phase ordering when adding keyboard-managed popups inside Radix dialogs. Scope interception to the focused field and an open or pending popup; verify both popup dismissal and subsequent dialog dismissal.

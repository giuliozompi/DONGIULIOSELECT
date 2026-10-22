---
name: GitHub release access
description: GitHub pushes may require the Replit GitHub connection even when a PAT secret exists.
---

When Git reports that the secure GitHub proxy has no accessible connection, connect GitHub to this environment through the integration flow.

**Why:** A previously working HTTPS push began routing through github.replit.internal and was rejected for a missing accessible GitHub connection despite the existing PAT-based askpass setup.

**How to apply:** Do not treat this as a missing repository or change the remote/URL to bypass the proxy. Resolve the current GitHub integration status and ask the user to connect it. After access is restored, retain the read-only Timeweb compatibility gate and verify the actual remote branch after pushing. Never claim the push succeeded when only fetch succeeded.

---
name: Editorial provider diagnostics
description: Diagnose OpenRouter refusals on Timeweb without repeated blind key or model changes.
---

Do not infer the cause of an OpenRouter 403 from the status alone or assume a
new API key will resolve it. OpenRouter also uses 403 for workspace/guardrail/key
spending limits and content-security rules. Regional restrictions require
explicit evidence from the actual provider response.

**Why:** Replacing the key and restarting Timeweb did not resolve the reported
refusal. The first diagnostic distinguished HTTP statuses but not their causes,
leading to configuration changes without a confirmed diagnosis.

**How to apply:** Classify provider metadata safely from the affected runtime,
including errors carried inside HTTP 200. Preserve the useful error fields
in memory until classification, but never expose raw bodies, credentials or
echoed source text. Use static allowlisted explanations. A successful workspace
probe does not prove that Timeweb uses the same key or has the same access.
Do not silently change model, disable safeguards or introduce automatic retries.

Official reference: https://openrouter.ai/docs/api_reference/errors-and-debugging

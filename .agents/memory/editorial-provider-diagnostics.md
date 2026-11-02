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

For cheese editorial generation, the user explicitly requested switching to
Gemini through OpenRouter after the refusal persisted with a replacement key
and a Timeweb restart.

**Why:** The user chose the model change; it is not an automatic fallback or a
confirmed diagnosis of the previous provider's refusal.

**How to apply:** Preserve the requested Gemini choice for editorial work while
keeping source verification and human review. Do not claim that a model switch
necessarily resolves an account-wide, security or regional restriction.

Treat a provider's “OpenAI-compatible” claim as transport compatibility, not
proof that all model parameters or structured-output requirements work.

**Why:** The user approved preparing Timeweb AI Gateway as an alternative, but
required keeping production inactive until a real test. Timeweb documents the
SDK and chat format without confirming every parameter used through OpenRouter.

**How to apply:** Keep provider selection explicit, use its own credential and
verified model ID, and validate JSON and source-based drafts against the actual
Gateway before release. Never silently drop JSON requirements or try another
provider to conceal an incompatibility.

An unauthenticated public-model request can distinguish a broad access refusal
from a failure specific to a key or model, but does not establish its geographic
cause.

**Why:** The user confirmed that Timeweb-origin OpenRouter public and authenticated
requests were both denied by a security policy, while the same environment could
list models and complete a strict-JSON request through Timeweb AI Gateway.

**How to apply:** Preserve that distinction when diagnosing future incidents.
The successful Gateway smoke test establishes basic access and JSON transport,
not correctness of complete cheese drafts, citations or publication.

The user subsequently confirmed «OK FUNZIONA!» after activating Timeweb AI Gateway
and retrying generation in the admin.

**Why:** This is live-user confirmation of the editorial generation path, beyond
the earlier minimal JSON transport probe.

**How to apply:** Keep the working Gateway configuration rather than returning
to blocked OpenRouter access. This confirmation does not establish the accuracy
of generated cheese facts or authorize automatic publication.

---
name: Telegram hosting diagnostics
description: Distinguish hosting connectivity from bot rejection and avoid duplicate notifications after ambiguous failures.
---

A successful Telegram bot probe from the workspace does not prove that Timeweb can reach Telegram or uses the same configuration.

**Why:** Live Timeweb notification records showed connection failures while workspace API probes succeeded. The generic message also previously covered an unreadable API response, so it was not enough to identify the actual networking failure.

**How to apply:** Diagnose from the affected hosting runtime where possible; use a read-only bot API probe, not unsolicited messages to customers. Keep DNS, TLS, timeout/reset, malformed-response and explicit bot rejections distinct. Never describe an IPv6 route as the confirmed cause without evidence from that runtime.

Do not automatically retry an ambiguous Telegram send. A timeout or reset after transmission can mean Telegram accepted the message but its response was lost.

**Why:** Repeating a payment-link notification blindly can duplicate messages and bypass the operator's deliberate resend policy.

**How to apply:** Report such outcomes as unconfirmed, preserve persistent resend limits, and keep retry manual. Never log raw Bot API URLs or error objects: the bot credential is embedded in the URL.

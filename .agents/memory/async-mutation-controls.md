---
name: Async mutation controls
description: Keep visible pending states aligned with synchronous request locks during rapid retries.
---

Destructive actions that use a synchronous in-flight lock must update visible pending controls in the initiating event, rather than relying only on mutation observer notifications.

**Why:** Mutation observers notify asynchronously. A fast retry can leave the previous error and enabled cancellation controls visible while the request lock already blocks cancellation. Browser traces confirmed that a correctly targeted cancellation click could therefore be ignored.

**How to apply:** Keep immediate pending UI and request locks aligned through settlement, including unmount/account changes. Browser tests should distinguish each retry's response, cover held and immediate responses, and retain request-count, focus, and saved-data assertions.

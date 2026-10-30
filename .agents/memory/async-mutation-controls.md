---
name: Async mutation controls
description: Keep visible pending states aligned with synchronous request locks during rapid retries.
---

Destructive actions that use a synchronous in-flight lock must update visible pending controls in the initiating event, rather than relying only on mutation observer notifications.

**Why:** Mutation observers notify asynchronously. A fast retry can leave the previous error and enabled cancellation controls visible while the request lock already blocks cancellation. Browser traces confirmed that a correctly targeted cancellation click could therefore be ignored.

**How to apply:** Keep immediate pending UI and request locks aligned through settlement, including unmount/account changes. Browser tests should distinguish each retry's response, cover held and immediate responses, and retain request-count, focus, and saved-data assertions.

For an address deletion rejected as already missing, defer reconciliation until the next address-book read rather than immediately removing the visible card.

**Why:** Keeping the failed confirmation and its original trigger stable lets the customer cancel and receive focus back predictably; treating a remote deletion as local success would misrepresent the failed action.

**How to apply:** Preserve cancellation and focus after the error, but ensure reopening the list obtains current server data even with indefinitely fresh caches. Test client-side navigation rather than only full reloads, which would conceal stale-cache errors.

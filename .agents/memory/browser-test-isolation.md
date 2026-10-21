---
name: Browser test isolation
description: Service-worker risk when mocking this app's network requests in browser tests.
---

Browser tests that mock API requests must bypass the app's service worker and verify that critical registration/login requests were actually intercepted.

**Why:** The service worker can move requests to a separate browser target outside page-level interception. A supposedly mocked registration test reached the development API and created a synthetic test account; the account was removed.

**How to apply:** Treat page-only request interception as insufficient while the service worker is active. Do not use real customer data, orders, payments, or messaging endpoints in browser fixtures.

---
name: Browser test isolation
description: Service-worker isolation and live-store identity pitfalls in browser tests.
---

Browser tests that mock API requests must bypass the app's service worker and verify that critical registration/login requests were actually intercepted.

**Why:** The service worker can move requests to a separate browser target outside page-level interception. A supposedly mocked registration test reached the development API and created a synthetic test account; the account was removed.

**How to apply:** Treat page-only request interception as insufficient while the service worker is active. Do not use real customer data, orders, payments, or messaging endpoints in browser fixtures.

Tests must not assume that importing an unversioned source URL accesses the application's live Zustand store during Vite hot reload.

**Why:** Vite can give the running module a versioned URL. Importing its unversioned URL can create a second store: seeded data then appears in test assertions but never reaches the rendered app.

**How to apply:** Prefer UI interactions or seed browser persistence and reload for hydration; assert the rendered UI and persisted state rather than a potentially detached imported store.

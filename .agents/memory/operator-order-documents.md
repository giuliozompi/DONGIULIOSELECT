---
name: Operator order changes and documents
description: Required payment-change traceability and printable documents for packing and dispatch.
---

Operators must be able to change an order's payment method, and these changes must always be recorded in the log.

**Why:** The user explicitly requested that payment-method changes always be logged. A payment method change must not leave an already chargeable YooKassa link active under a contradictory method.

**How to apply:** Persist the previous/new method, operator and time together with the change; fail rather than silently accepting an unlogged update. Do not change paid/closed orders or orders with an existing provider payment until that provider situation is explicitly resolved.

Both the packing list and the internal box label must contain the order QR, with its code also printed small below. The box label must include the customer's name.

**Why:** The user wants these codes scanned when dispatching parcels. The QR identifies the order; it is not a carrier tracking or shipping label.

**How to apply:** Keep the same complete order identifier in both QR payloads and the human-readable text; a scan should work in order search. A4 and 100 × 150 mm are initial paper defaults, not confirmed customer-printer specifications. Do not infer successful physical printing from opening a browser print dialog.

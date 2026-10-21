---
name: Repeating customer orders
description: Pricing and quantity requirements for repeating a previous purchase.
---

Repeating an order adds its products to the cart at current catalogue prices, not the historical order's prices or total.

**Why:** The user requested “ripeti l'ordine” in both the list and detail, explicitly updating prices if they have changed.

**How to apply:** Preserve the purchased quantities and gram precision, update the price even when a matching product is already in the cart, and keep unrelated cart products. This is a cart action, not immediate order placement or payment.

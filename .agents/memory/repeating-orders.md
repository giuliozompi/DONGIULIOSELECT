---
name: Repeating customer orders
description: Pricing and quantity requirements for repeating a previous purchase.
---

Repeating an order adds its products to the cart at current catalogue prices, not the historical order's prices or total.

**Why:** The user requested “ripeti l'ordine” in both the list and detail, explicitly updating prices if they have changed.

**How to apply:** Preserve the purchased quantities and gram precision, update the price even when a matching product is already in the cart, and keep unrelated cart products. This is a cart action, not immediate order placement or payment.

Price comparisons refer only to the successfully repeated quantities, not the entire cart or the historical order amount. Exclude missing products and cart conflicts from both sides of the comparison; do not treat unavailable historical prices as zero.

**Why:** Historical amounts include discounts or delivery, and existing cart quantities can make a price-change total misleading. Gram/kg conversions must not appear as price increases.

**How to apply:** Compare equal physical quantities with weight prices normalized to kg, and label product-only totals separately from discounts and delivery.

---
name: Guest checkout continuation
description: Expected registration and cart behavior when a new customer starts checkout.
---

A new, unregistered customer who adds products to the cart and starts checkout must be able to register immediately and then continue checkout with that cart.

**Why:** The user reported that the registration prompt did not open registration, preventing new customers from completing their purchase.

**How to apply:** Keep the existing cart and any checkout draft through registration or login. Authentication should resume checkout, not create the order automatically or send the customer back to the catalogue.

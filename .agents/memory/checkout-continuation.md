---
name: Guest checkout continuation
description: Expected registration and cart behavior when a new customer starts checkout.
---

A new, unregistered customer who adds products to the cart and starts checkout must be able to register immediately and then continue checkout with that cart.

**Why:** The user reported that the registration prompt did not open registration, preventing new customers from completing their purchase.

**How to apply:** Keep the existing cart and any checkout draft through registration or login. Authentication should resume checkout, not create the order automatically or send the customer back to the catalogue.

## Address entry

On the website, collect and normalize addresses in checkout and the address book, without adding address fields to registration.

**Why:** The user explicitly chose “Nel checkout e nella rubrica, senza cambiare la registrazione” when offered both alternatives.

**How to apply:** Reuse the same DaData address system as the Telegram app. Do not move address collection into account creation without a new request.

## Applying saved addresses

Keep a customer's delivery draft intact when the address book loads or refreshes, including after authentication. Applying a saved or default address must be an explicit customer action.

**Why:** The user requires reuse of saved delivery details without overwriting a draft the customer has already edited.

**How to apply:** Do not auto-apply the default address on data arrival; keep manual/DaData entry available alongside the address book.

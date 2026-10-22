---
name: Telegram account linking
description: Product rule for recognizing an existing Telegram association in the customer's personal account.
---

Un cliente che ha già completato il collegamento a Telegram non deve ripetere la procedura; nel suo личный кабинет deve vedere che l'account è già collegato.

**Why:** the user explicitly requested persistent recognition and visible status for customers who already completed linking.

**How to apply:** verify the saved association for the currently signed-in customer. Do not interpret a failed status check as an unlinked account or infer ownership from merely opening the bot. Expiration of a linking code must not expire an already saved association. Replacing a linked Telegram account requires an explicit unlink, to avoid accidental reassignment.

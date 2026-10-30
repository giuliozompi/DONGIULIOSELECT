---
name: Selling-unit changes
description: Why cart quantities must not be migrated automatically when the catalogue changes selling units.
---

Treat a saved quantity and its selling unit as inseparable. When the catalogue changes from weight to pieces or packages (or vice versa), preserve the saved row until the customer removes it and adds the product again; explain the difference rather than silently converting.

**Why:** The same product ID can survive a catalogue unit change, but there is no reliable conversion factor between a kilogram and a piece or package. A numeric quantity alone is insufficient to authorize a migration, and a price per new unit cannot be multiplied by a quantity in the old unit.

**How to apply:** Use the saved unit for existing-row quantity controls and labels. Distinguish a current catalogue offer from the saved cart line. Keep this separate from spelling/case normalization and the explicit pricing rules for repeating orders.

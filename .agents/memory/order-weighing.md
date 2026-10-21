---
name: Order weighing
description: Precision required when operators correct weights during order preparation.
---

When an operator corrects an in-progress order after weighing products sold by weight, they must be able to enter the weight in kilograms with three decimal places after the comma.

**Why:** The user requires actual measured weights during order preparation, rather than quantities rounded to tenths of a kilogram.

**How to apply:** Preserve gram precision in operator order editing, accept comma decimal input, and keep the measured weight when recalculating the order.

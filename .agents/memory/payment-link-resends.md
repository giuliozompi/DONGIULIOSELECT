---
name: Payment link resends
description: Operator requirements and safety decisions for resending payment notifications
---

## Persistent operator visibility
The user requires a resend-payment-link action in admin Orders, protection against sending too often, and sending status that is always visible.

**Why:** The user said “lo stato degli invii deve essere sempre visibile”; a transient toast cannot satisfy that requirement.

**How to apply:** Keep the latest outcome visible in the list and maintain persistent per-channel history in order details, including failures, skipped channels and unconfirmed outcomes. Provider acceptance is not confirmed delivery to the customer; legacy “sent” records are not delivery receipts.

## Shared sending policy
The chosen defaults are a five-minute minimum interval and three attempts per order per hour, including failed attempts and initial sends through the shared dispatcher. These limits apply across operators, browser tabs and app instances. Polling and cooldown expiry must never automatically send anything.

**Why:** A per-browser button lock would not prevent several operators from contacting the same customer repeatedly. Counting failures also prevents a broken configuration from causing rapid repeated attempts.

**How to apply:** Enforce limits with persistent reservations before payment preparation or notification calls. Sending is fail-closed if the reservation/history store is unavailable, even though channel-preference lookup intentionally remains fail-open. An interrupted attempt must become explicitly unconfirmed, not successful or silently forgotten; retain a ten-minute pending grace period before allowing a deliberate retry.

## Resend is not payment recreation
A resend uses the existing YooKassa payment and checks its live unpaid status and current amount. Expired links and amount changes require a separate, explicit payment-renewal operation.

**Why:** Asking to send a message again must not silently create another payment or send an obsolete total after weighing. A concurrent payment webhook must not be overwritten by a notification status update.

**How to apply:** Never create another payment automatically from the resend action. Recheck order changes before sending and preserve paid/closed order states when recording acceptance.

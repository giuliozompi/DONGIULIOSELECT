---
name: Notification Settings System
description: How global channel toggles and per-user opt-outs work; where the code lives; design decisions
---

## Architecture
- `notification_channel_settings` table: one row per channel (telegram/whatsapp/email), `enabled` bool
- `user_notification_preferences` table: one row per (userId, channel), `enabled` bool
- Both tables created at startup via `server/services/db-migrations.ts` (CREATE TABLE IF NOT EXISTS)
- Helper: `server/services/notification-settings.ts` → `canNotify(channel, userId?)` function

## Key design decisions
- **Fail-open**: if DB query fails, `canNotify` returns true (notifications go through)
- **60s cache**: global settings cached in memory to avoid DB hit on every notification
- **Silent skip**: when disabled, notifications are skipped without logging a 'failed' entry
- **`if (...) try { } catch { }` pattern** in routes.ts: valid TS, minimal diff, skip entire block

**Why:** User primarily needed to put WhatsApp on standby globally. Per-user opt-out handles clients who blocked the bot.

## Where checks are applied (routes.ts)
1. Telegram to customer: order_created
2. WhatsApp to customer: order_created, payment_link (two endpoints), status_change
3. Telegram to customer: status_change

## Payment-link reporting semantics

Treat provider acceptance as an accepted send, not proof of delivery to the customer. Preserve partial channel failures in operator-facing warnings even if another channel accepts the message.

**Why:** Customers reported missing payment links while the admin reported success; a boolean email failure had been ignored, and Telegram rejection did not prevent an unconditional success state.

**How to apply:** Keep payment creation, provider acceptance, and confirmed customer delivery distinct when extending notifications or admin status transitions. Do not reinterpret old `sent` records as delivery receipts.

## Admin UI
- Settings page → "Уведомления" tab (master admin only): global toggles per channel
- Client detail → "Уведомления клиента" card (master admin only): per-client toggles

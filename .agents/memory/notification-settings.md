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

Email customer/manager notifications are NOT wrapped (email rarely needs disabling).

## Admin UI
- Settings page → "Уведомления" tab (master admin only): global toggles per channel
- Client detail → "Уведомления клиента" card (master admin only): per-client toggles

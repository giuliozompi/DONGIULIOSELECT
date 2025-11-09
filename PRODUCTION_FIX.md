# Fix Payment Link Generation in Production

## Problem Identified
The production database has extra fiscal columns in `payment_intents` table that don't exist in the schema. When `createPaymentIntent()` runs, it omits these columns, causing INSERT to fail if they're NOT NULL without defaults.

## Step 1: Verify Production Database Schema

Run this query in the production database console:

```sql
-- Check if extra columns exist in payment_intents
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'payment_intents'
ORDER BY ordinal_position;
```

**Expected columns** (from shared/schema.ts):
- id
- order_id
- provider
- status
- amount
- redirect_url
- created_at
- raw

**If you see extra columns like:**
- receipt_id
- receipt_url
- receipt_status
- fiscal_data

→ These are the problem! They should ONLY be in `orders` table, not `payment_intents`.

---

## Step 2: Choose a Fix Strategy

### Option A: Remove Extra Columns (RECOMMENDED)

This aligns production with the correct schema:

```sql
-- PRODUCTION DATABASE ONLY - Run this in production console
-- Backup first!

ALTER TABLE payment_intents DROP COLUMN IF EXISTS receipt_id;
ALTER TABLE payment_intents DROP COLUMN IF EXISTS receipt_url;
ALTER TABLE payment_intents DROP COLUMN IF EXISTS receipt_status;
ALTER TABLE payment_intents DROP COLUMN IF EXISTS fiscal_data;
```

**After running:**
- Payment link generation will work immediately
- No code changes needed
- Fiscal data stays in `orders` table where it belongs

---

### Option B: Make Columns Nullable (Temporary Fix)

If you need time to test, make the columns nullable first:

```sql
-- PRODUCTION DATABASE ONLY
ALTER TABLE payment_intents ALTER COLUMN receipt_id DROP NOT NULL;
ALTER TABLE payment_intents ALTER COLUMN receipt_url DROP NOT NULL;
ALTER TABLE payment_intents ALTER COLUMN receipt_status DROP NOT NULL;
ALTER TABLE payment_intents ALTER COLUMN fiscal_data DROP NOT NULL;

-- Add defaults
ALTER TABLE payment_intents ALTER COLUMN receipt_id SET DEFAULT NULL;
ALTER TABLE payment_intents ALTER COLUMN receipt_url SET DEFAULT NULL;
ALTER TABLE payment_intents ALTER COLUMN receipt_status SET DEFAULT NULL;
ALTER TABLE payment_intents ALTER COLUMN fiscal_data SET DEFAULT NULL;
```

Then plan to remove them later with Option A.

---

## Step 3: Verify Fix Works

After applying Option A or B:

1. Test payment link generation in production
2. Check logs for Step 5/8 success: `✅ [Order xxx] YooKassa payment created`
3. Verify order status changes to "ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ"

---

## Step 4: Prevent Future Schema Drift

To avoid this happening again:

1. **Never manually add columns** to production database
2. **Always use Drizzle migrations**: 
   - Update `shared/schema.ts`
   - Run `npm run db:push` in development
   - Deploy the code (schema changes apply automatically)

---

## Why This Happened

- Fiscal receipt data belongs in `orders` table (where it is)
- Someone manually added these columns to `payment_intents` in production
- The code never expected these columns, so INSERT fails
- Solution: Remove the duplicate columns from `payment_intents`

---

## Quick Summary

**IF** you want to fix it now:
1. Open production database console
2. Run Option A SQL commands (drop columns)
3. Test payment link generation
4. ✅ Fixed!

**IF** you want to be cautious:
1. Run Option B SQL commands (make nullable)
2. Test payment link generation
3. Later, run Option A to clean up

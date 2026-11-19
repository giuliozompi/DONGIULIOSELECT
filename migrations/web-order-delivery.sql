-- Apply to the confirmed Timeweb database only with explicit release approval.
BEGIN;
SET LOCAL lock_timeout = '3s';
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS desired_delivery_date date,
  ADD COLUMN IF NOT EXISTS delivery_fee_in_order numeric(10, 2);
COMMIT;

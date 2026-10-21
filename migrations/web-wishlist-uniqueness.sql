-- Targeted migration for an externally managed PostgreSQL database.
-- Run only after confirming the target and obtaining authorization.
-- NOT a startup/deploy hook or a Drizzle journal migration.
BEGIN;
-- Prevent an old toggle writer from inserting duplicates between preflight and DDL.
LOCK TABLE web_wishlists IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM web_wishlists
    GROUP BY user_id, product_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate wishlist pairs exist: stop and request an approved cleanup. No rows were deleted.';
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS web_wishlists_user_product_unique
  ON web_wishlists (user_id, product_id);
COMMIT;

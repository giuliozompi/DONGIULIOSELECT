# Wishlist uniqueness rollout

The app uses its own `DATABASE_URL` through node-postgres. Confirm who manages the
target database before applying schema changes; do not assume Replit Publish
migrates an external Neon/other PostgreSQL database.

1. Run `npm run db:check-wishlist-duplicates` with the intended database configured.
   It only reports aggregate duplicate-pair and extra-row counts, never deletes
   data, and exits unsuccessfully on duplicates or connection errors.
2. If duplicates exist, stop and obtain approval for a separate cleanup. Do not
   delete them automatically or accept any truncate/reset prompt.
3. For development, the existing post-merge `npm run db:push` runs this preflight
   before Drizzle. For an external production database, an authorized operator
   must confirm the target and apply `web-wishlist-uniqueness.sql` before releasing
   the new server. It locks writes briefly and rechecks duplicates under the lock,
   so an old writer cannot insert duplicates between the check and index creation.
   This SQL is standalone, not part of the existing Drizzle migration journal.
   On a SQL error roll back the transaction; nothing should be cleaned up.
4. Replit-managed production databases instead use the supported Publish schema
   diff flow. Never add production DDL to startup or deployment hooks.

New clients use PUT to add and DELETE to remove. Repetition preserves the desired
state; simultaneous opposite operations resolve in database execution order (not
client click order). Responses describe the completed operation, not a promise
that another device has not changed it afterwards.

The old POST toggle returns 405 without writing. Already-open old clients must
refresh; retaining a toggle compatibility path would retain the original race.
Do not roll back to an old toggle server without considering its insert conflicts
with the new uniqueness constraint.

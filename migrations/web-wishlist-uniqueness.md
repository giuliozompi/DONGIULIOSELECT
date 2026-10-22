# Wishlist uniqueness rollout

## Timeweb release gate (read-only)

Before a release push, run `npm run db:check-timeweb`. This command uses **only**
the confirmed `TIMEWEB_DATABASE_URL` secret; it never falls back to `DATABASE_URL`,
`NEON_DATABASE_URL`, or inherited PostgreSQL connection defaults. The URL must
explicitly contain host, username, password and database. Only `sslmode` is
accepted as a query option, so URL options cannot redirect the target or disable
timeouts/read-only mode. Omitted SSL mode verifies the server certificate;
`require` follows node-postgres semantics (encryption without CA verification).
Do not weaken the confirmed connection's TLS policy to make a failed check pass.

Both `scripts/push-github.sh` and `scripts/push-dockerfile.sh` run the gate before
their GitHub write to `main`. A missing secret, unreachable database, permission
error, timeout, missing table/column or incompatible index blocks the operation.
This task adds the guard; it does not authorize a push or deployment.
Direct Git pushes and manual GitHub edits are not intercepted by these helpers.

Current release prerequisites are explicitly defined in
`scripts/check-timeweb-compatibility.mjs`:

- `public.web_wishlists` with non-null `varchar` columns `id`, `user_id`,
  `product_id`, and non-null `timestamp` column `created_at`; `id` and `created_at`
  need defaults.
- `public.web_wishlists_user_product_unique` must belong to that table and be
  unique, valid, ready, live, immediate, unconditional, and a plain B-tree over
  exactly `(user_id, product_id)` in that order, without extra or included columns.
  Merely finding an object with the right name is insufficient.

This is an explicit release prerequisite check, not a full schema diff. Extend
the prerequisite manifest and its tests for future schema-dependent releases.
It uses a read-only transaction, 3-second connection/statement timeouts, a 1-second
lock timeout and a 15-second overall CLI deadline. It neither migrates nor repairs
anything and is not run from application startup or a deployment hook.

For an optional aggregate-only duplicate diagnostic, run
`npm run db:check-timeweb -- --count-duplicates`. This reports duplicate-pair and
extra-row counts without customer or product identifiers. Zero duplicates does
**not** substitute for a valid unique index. The default check reads catalog
metadata and no customer rows. Errors never print connection URLs or raw driver
diagnostics.

If the gate fails, stop the release. Confirm the target and arrange separately
authorized migration/cleanup; do not bypass the gate or add automatic DDL.
After that separate operation, rerun the gate.

`npm run test:timeweb-preflight` exercises a disposable local PostgreSQL cluster
(requires `initdb` and `pg_ctl`) and mocks all GitHub writes. It never connects to
the workspace or Timeweb database and never sends a real push.

## Separately authorized schema rollout

The app uses its own `DATABASE_URL` through node-postgres. Confirm who manages the
target database before applying schema changes; do not assume Replit Publish
migrates an external Neon/other PostgreSQL database.

1. For development, run `npm run db:check-wishlist-duplicates` with the intended
   development database configured as `DATABASE_URL`. For Timeweb, use the
   dedicated `db:check-timeweb -- --count-duplicates` command above instead.
   It only reports aggregate duplicate-pair and extra-row counts, never deletes
   data, and exits unsuccessfully on duplicates or connection errors. The
   development check allows a missing table; the Timeweb release gate does not.
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

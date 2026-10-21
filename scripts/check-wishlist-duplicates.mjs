import pg from 'pg';

// Read-only preflight for the same configured database used by server/db.ts.
// Never print connection strings or customer/product identifiers.
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required for the wishlist duplicate check.');
  process.exit(1);
}
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});
try {
  const { rows: tables } = await pool.query("SELECT to_regclass('web_wishlists') IS NOT NULL AS exists");
  if (!tables[0].exists) {
    // A fresh database has no wishlist data to inspect before its first db:push.
    console.log('web_wishlists does not exist yet; no existing wishlist entries to check.');
  } else {
    const { rows } = await pool.query(`
    SELECT count(*)::int AS duplicate_pairs,
           coalesce(sum(copies - 1), 0)::int AS extra_rows
    FROM (
      SELECT count(*) AS copies FROM web_wishlists
      GROUP BY user_id, product_id HAVING count(*) > 1
    ) duplicates
  `);
    console.log(JSON.stringify(rows[0]));
    if (rows[0].duplicate_pairs > 0) {
      console.error('Duplicate wishlist entries found. Stop migration and request an approved cleanup; nothing was deleted.');
      process.exitCode = 1;
    }
  }
} catch {
  console.error('Wishlist duplicate check failed; no schema or data changes were made.');
  process.exitCode = 1;
} finally {
  await pool.end();
}

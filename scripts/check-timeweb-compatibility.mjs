import pg from 'pg';
import { pathToFileURL } from 'node:url';

// Release prerequisite manifest: extend this check whenever a release needs
// additional schema. This is deliberately separate from the development
// duplicate preflight, where a not-yet-created table is allowed.
const columnsSql = `
  SELECT a.attname AS name, t.typname AS type, a.attnotnull AS not_null,
         a.atthasdef AS has_default
  FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
  WHERE a.attrelid = to_regclass('public.web_wishlists')
    AND a.attnum > 0 AND NOT a.attisdropped
`;
const indexSql = `
  SELECT i.indisunique AS is_unique, i.indisvalid AS is_valid,
         i.indisready AS is_ready, i.indislive AS is_live,
         i.indimmediate AS is_immediate,
         i.indpred IS NULL AS is_unconditional,
         i.indexprs IS NULL AS is_plain, am.amname AS method,
         i.indnkeyatts AS key_count, i.indnatts AS column_count,
         ARRAY(
           SELECT a.attname::text
           FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, position)
           LEFT JOIN pg_catalog.pg_attribute a
             ON a.attrelid = i.indrelid AND a.attnum = k.attnum
           ORDER BY k.position
         ) AS columns
  FROM pg_catalog.pg_index i
  JOIN pg_catalog.pg_class idx ON idx.oid = i.indexrelid
  JOIN pg_catalog.pg_am am ON am.oid = idx.relam
  WHERE i.indexrelid = to_regclass('public.web_wishlists_user_product_unique')
    AND i.indrelid = to_regclass('public.web_wishlists')
`;
const duplicatesSql = `
  SELECT count(*)::text AS duplicate_pairs,
         coalesce(sum(copies - 1), 0)::text AS extra_rows
  FROM (
    SELECT count(*) AS copies FROM public.web_wishlists
    GROUP BY user_id, product_id HAVING count(*) > 1
  ) duplicates
`;

export function connectionConfig(value) {
  if (!value) throw new Error('missing configuration');
  const url = new URL(value);
  // Never allow pg's inherited workspace PG* settings or URL query parameters
  // to supply/override a target, timeout, or session options.
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !url.hostname || !url.username || !url.password
    || url.pathname.length < 2 || url.hash
    || [...url.searchParams.keys()].some(key => key !== 'sslmode')) {
    throw new Error('invalid configuration');
  }
  const sslmode = url.searchParams.get('sslmode') || 'verify-full';
  if (!['disable', 'require', 'verify-ca', 'verify-full', 'no-verify'].includes(sslmode)) {
    throw new Error('invalid SSL mode');
  }
  return {
    host: decodeURIComponent(url.hostname).replace(/^\[|\]$/g, ''),
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    ssl: sslmode === 'disable' ? false
      : { rejectUnauthorized: !['require', 'no-verify'].includes(sslmode) },
    connectionTimeoutMillis: 3000,
    statement_timeout: 3000,
    lock_timeout: 1000,
    query_timeout: 4000,
    idle_in_transaction_session_timeout: 5000,
    options: '-c default_transaction_read_only=on -c search_path=pg_catalog,public',
    application_name: 'timeweb-readonly-preflight',
  };
}

export async function checkTimeweb({
  env = process.env, log = console.log, error = console.error,
  Client = pg.Client, countDuplicates = false,
} = {}) {
  let client;
  let timedOut = false;
  let watchdog;
  try {
    const config = connectionConfig(env.TIMEWEB_DATABASE_URL);
    client = new Client(config);
    // Do not expose raw pg errors (they may contain credentials or row values).
    client.on('error', () => {});
    watchdog = setTimeout(() => {
      timedOut = true;
      client.connection?.stream?.destroy();
    }, 12000);
    await client.connect();
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const { rows: session } = await client.query('SHOW transaction_read_only');
    if (session[0]?.transaction_read_only !== 'on') throw new Error('not read-only');
    // Also holds an AccessShare lock until rollback, so the inspected table
    // cannot disappear midway through the check. No customer rows are read.
    await client.query('SELECT id, user_id, product_id, created_at FROM public.web_wishlists LIMIT 0');
    const { rows: columns } = await client.query(columnsSql);
    const required = { id: 'varchar', user_id: 'varchar', product_id: 'varchar', created_at: 'timestamp' };
    if (!Object.entries(required).every(([name, type]) => columns.some(column =>
      column.name === name && column.type === type && column.not_null
      && (!['id', 'created_at'].includes(name) || column.has_default)))) {
      error('Timeweb: colonne dei preferiti mancanti o incompatibili. Push bloccato.');
      return false;
    }
    const { rows } = await client.query(indexSql);
    const index = rows[0];
    const ready = index?.is_unique && index.is_valid && index.is_ready && index.is_live
      && index.is_immediate && index.is_unconditional && index.is_plain
      && index.method === 'btree' && index.key_count === 2 && index.column_count === 2
      && JSON.stringify(index.columns) === JSON.stringify(['user_id', 'product_id']);
    let duplicates = false;
    if (countDuplicates) {
      const { rows: counts } = await client.query(duplicatesSql);
      log(`Timeweb: duplicati=${counts[0].duplicate_pairs}; righe extra=${counts[0].extra_rows}.`);
      duplicates = counts[0].duplicate_pairs !== '0';
    }
    if (!ready || duplicates) {
      error('Timeweb: indice univoco dei preferiti mancante, non valido o incompatibile. Push bloccato; nessuna modifica eseguita.');
      return false;
    }
    if (timedOut) throw new Error('deadline');
    log('Timeweb: prerequisiti della release verificati in sola lettura.');
    return true;
  } catch {
    error('Timeweb: compatibilità non verificabile. Controllare TIMEWEB_DATABASE_URL, connessione, permessi e schema. Push bloccato; nessuna modifica eseguita.');
    return false;
  } finally {
    if (client) {
      try {
        if (!timedOut) await client.query('ROLLBACK');
      } catch { /* Only discard the connection; never log raw database errors. */ }
      try { await client.end(); } catch { /* No credentials in logs. */ }
    }
    clearTimeout(watchdog);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--count-duplicates')) {
    console.error('Uso: node scripts/check-timeweb-compatibility.mjs [--count-duplicates]');
    process.exitCode = 1;
  } else {
    // Hard deadline also covers a broken driver, DNS, or connection teardown.
    const deadline = setTimeout(() => {
      console.error('Timeweb: tempo massimo del controllo superato. Push bloccato.');
      process.exit(1);
    }, 15000);
    process.exitCode = await checkTimeweb({ countDuplicates: args.includes('--count-duplicates') }) ? 0 : 1;
    clearTimeout(deadline);
  }
}

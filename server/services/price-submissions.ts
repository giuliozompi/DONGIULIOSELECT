import { createHash, randomUUID } from 'node:crypto';
import { pool } from '../db';
import { audit, entry, EditorialError, transaction, type Row } from './editorial';
import { priceDataSchema } from '../../shared/editorial';
import {
  priceSubmissionSchema, PRICE_SUBMISSION_LIMIT, PRICE_SUBMISSION_INTERVAL_MS, PRICE_SUBMISSION_WINDOW_MS,
  type PriceSubmissionInput, type OwnPriceSubmission, type OwnPriceSubmissionPage,
} from '../../shared/price-submissions';

export class PriceSubmissionLimitError extends EditorialError {
  constructor(public nextAllowedAt: string, public retryAfterSeconds: number) {
    super(429, 'Лимит отправок: не чаще одного раза в минуту и не более 10 за 24 часа. Попробуйте позже.');
  }
}
function limits(recent: Date[], now: Date): OwnPriceSubmissionPage['limits'] {
  const times = recent.map(date => new Date(date).valueOf()).sort((a, b) => a - b);
  const nextMinute = times.length ? times[times.length - 1] + PRICE_SUBMISSION_INTERVAL_MS : 0;
  const nextDay = times.length >= PRICE_SUBMISSION_LIMIT
    ? times[times.length - PRICE_SUBMISSION_LIMIT] + PRICE_SUBMISSION_WINDOW_MS : 0;
  const next = Math.max(nextMinute, nextDay);
  return { dailyRemaining: Math.max(0, PRICE_SUBMISSION_LIMIT - times.length),
    nextAllowedAt: next > now.valueOf() ? new Date(next).toISOString() : null };
}
const normalized = (value: string) => value.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ').trim();
function fingerprint(cheeseId: string, data: PriceSubmissionInput): string {
  let source = data.sourceUrl;
  if (source) {
    const url = new URL(source);
    url.hash = '';
    url.searchParams.sort();
    source = url.toString();
  }
  // Canonical key order and numbers make JSON/property order and text casing irrelevant.
  return createHash('sha256').update(JSON.stringify([
    cheeseId, data.price, data.currency, normalized(data.country), normalized(data.store),
    source, data.observedOn, data.packageQuantity, data.packageUnit,
  ])).digest('hex');
}
function own(row: { id: string; payload: PriceSubmissionInput; moderation: OwnPriceSubmission['status'] | null;
  created_at: Date | string; updated_at: Date | string | null }): OwnPriceSubmission {
  return { id: row.id, data: row.payload, status: row.moderation ?? 'removed',
    submittedAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at ?? row.created_at).toISOString() };
}

export async function submitPrice(cheeseId: string, input: unknown, userId: string, database = pool): Promise<OwnPriceSubmission> {
  if (!userId) throw new EditorialError(401, 'Требуется авторизация');
  const data = priceSubmissionSchema.parse(input);
  const digest = fingerprint(cheeseId, data);
  return transaction(database, async client => {
    const user = await client.query('SELECT id FROM web_users WHERE id=$1', [userId]);
    if (!user.rowCount) throw new EditorialError(401, 'Войдите в аккаунт заново.');
    const parent = await client.query("SELECT entry_id FROM editorial_publications WHERE entry_id=$1 AND kind='cheese'", [cheeseId]);
    if (!parent.rowCount) throw new EditorialError(404, 'Сырная статья не опубликована');
    // Use the database clock AFTER acquiring the shared editorial write lock.
    const now: Date = (await client.query('SELECT clock_timestamp() AS now')).rows[0].now;
    const since = new Date(now.valueOf() - PRICE_SUBMISSION_WINDOW_MS);
    const recent = await client.query(`SELECT created_at,fingerprint FROM editorial_price_submissions
      WHERE user_id=$1 AND created_at>$2 ORDER BY created_at`, [userId, since]);
    if (recent.rows.some(row => row.fingerprint === digest))
      throw new EditorialError(409, 'Вы уже отправили такое наблюдение за последние 24 часа. Проверьте его статус ниже.');
    const allowance = limits(recent.rows.map(row => row.created_at), now);
    if (allowance.nextAllowedAt)
      throw new PriceSubmissionLimitError(allowance.nextAllowedAt,
        Math.max(1, Math.ceil((new Date(allowance.nextAllowedAt).valueOf() - now.valueOf()) / 1000)));
    const id = randomUUID();
    const { channel: _channel, ...observation } = data;
    const editorialData = priceDataSchema.parse({ ...observation, cheeseId, sourceType: 'user', notes: '' });
    const saved: Row = (await client.query(`INSERT INTO editorial_entries
      (id,kind,data,moderation,created_by,updated_by,created_at,updated_at)
      VALUES($1,'price',$2,'pending',$3,$3,$4,$4) RETURNING *`,
      [id, JSON.stringify(editorialData), userId, now])).rows[0];
    await client.query(`INSERT INTO editorial_price_submissions
      (id,entry_id,user_id,cheese_id,payload,fingerprint,created_at) VALUES($1,$1,$2,$3,$4,$5,$6)`,
      [id, userId, cheeseId, JSON.stringify(data), digest, now]);
    await audit(client, userId, 'price_submitted', id, null, entry(saved));
    return own({ id, payload: data, moderation: 'pending', created_at: now, updated_at: now });
  });
}

export async function ownPriceSubmissions(cheeseId: string, userId: string, page: number, limit: number,
  database = pool): Promise<OwnPriceSubmissionPage> {
  if (!userId) throw new EditorialError(401, 'Требуется авторизация');
  // The full owner-only page, its count and account-wide quota share one read snapshot.
  const { rows } = await database.query(`WITH parent AS (
      SELECT entry_id FROM editorial_publications WHERE entry_id=$2 AND kind='cheese'
    ), owned AS (
      SELECT s.id,s.payload,s.created_at,e.updated_at,e.moderation FROM editorial_price_submissions s
      LEFT JOIN editorial_entries e ON e.id=s.entry_id
      WHERE s.user_id=$1 AND s.cheese_id=$2
    ), paged AS (SELECT * FROM owned ORDER BY created_at DESC,id LIMIT $3 OFFSET $4)
    SELECT EXISTS(SELECT 1 FROM parent) AS published,
      (SELECT count(*)::int FROM owned) AS total,
      COALESCE((SELECT jsonb_agg(paged ORDER BY created_at DESC,id) FROM paged),'[]'::jsonb) AS items,
      ARRAY(SELECT created_at FROM editorial_price_submissions WHERE user_id=$1
        AND created_at>statement_timestamp()-interval '24 hours' ORDER BY created_at) AS recent,
      statement_timestamp() AS now`, [userId, cheeseId, limit, (page - 1) * limit]);
  const row = rows[0];
  if (!row.published) throw new EditorialError(404, 'Сырная статья не опубликована');
  return { items: row.items.map(own), total: row.total, page, limit, limits: limits(row.recent, row.now) };
}

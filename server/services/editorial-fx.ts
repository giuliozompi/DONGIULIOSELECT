import { pool } from '../db';
import { editorialToday } from '../../shared/editorial';
import type { FxRates } from '../../shared/editorial-market';
const SOURCE = 'https://www.cbr.ru/scripts/XML_daily.asp';
const dayValid = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) &&
  Number.isFinite(new Date(day).valueOf()) && new Date(day).toISOString().slice(0, 10) === day;
export function parseCbrXml(xml: string, requestedOn: string) {
  if (!dayValid(requestedOn) || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Invalid rate document');
  const date = xml.match(/<ValCurs\b[^>]*\bDate=["'](\d{2})\.(\d{2})\.(\d{4})["']/i);
  if (!date) throw new Error('No effective date');
  const effectiveOn = `${date[3]}-${date[2]}-${date[1]}`;
  if (!dayValid(effectiveOn) || effectiveOn > requestedOn) throw new Error('Future/invalid rate date');
  const rates: Record<string, number> = { RUB: 1 };
  for (const match of Array.from(xml.matchAll(/<Valute\b[^>]*>([\s\S]*?)<\/Valute>/gi))) {
    const code = match[1].match(/<CharCode>([A-Z]{3})<\/CharCode>/)?.[1];
    const nominal = Number(match[1].match(/<Nominal>([\d ]+)<\/Nominal>/)?.[1]?.replace(/ /g, ''));
    const value = Number(match[1].match(/<Value>([\d ,.]+)<\/Value>/)?.[1]?.replace(/ /g, '').replace(',', '.'));
    if (!code || code === 'RUB' || !Number.isInteger(nominal) || nominal <= 0 ||
      !Number.isFinite(value) || value <= 0 || value > 1e12 || rates[code]) throw new Error('Invalid rate');
    rates[code] = value / nominal;
  }
  if (Object.keys(rates).length < 2) throw new Error('Empty currency feed');
  return { effectiveOn, rates };
}
export async function fetchCbrXml(day: string) {
  const res = await fetch(`${SOURCE}?date_req=${day.split('-').reverse().join('/')}`, {
    signal: AbortSignal.timeout(8000), redirect: 'error', headers: { Accept: 'application/xml,text/xml' },
  });
  if (!res.ok || !res.body) throw new Error('CBR unavailable');
  const reader = res.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      bytes += value.length; if (bytes > 128 * 1024) throw new Error('Oversized feed');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return new TextDecoder('windows-1251').decode(Buffer.concat(chunks));
}
type FxState = { pending?: Promise<FxRates>; pendingDay?: string; retryAfter?: number };
const liveState: FxState = {};
// State injection isolates deterministic tests; the live service shares one refresh.
async function loadEditorialFx(database: typeof pool, fetchXml: typeof fetchCbrXml, now: Date, state: FxState): Promise<FxRates> {
  const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(now);
  const result = (row: any, status: FxRates['status'], warning: string | null): FxRates => ({
    status, source: 'Банк России', sourceUrl: 'https://www.cbr.ru/currency_base/daily/',
    requestedOn: day, effectiveOn: row ? String(row.effective_on).slice(0, 10) : null,
    fetchedAt: row ? new Date(row.fetched_at).toISOString() : null, rates: row?.rates || { RUB: 1 }, warning,
  });
  const latest = (await database.query(`SELECT requested_on::text,effective_on::text,rates,fetched_at
    FROM editorial_fx_rates WHERE requested_on<=$1 ORDER BY requested_on DESC LIMIT 1`, [day])).rows[0];
  const age = latest ? now.valueOf() - new Date(latest.fetched_at).valueOf() : Infinity;
  const effectiveAge = latest ? (new Date(day).valueOf() - new Date(latest.effective_on).valueOf()) / 86400000 : Infinity;
  if (latest?.requested_on === day && age >= 0 && age < 6 * 3600000 && effectiveAge <= 7)
    return result(latest, 'fresh', null);
  const stale = () => result(latest, latest ? 'stale' : 'unavailable',
    latest ? 'Не удалось подтвердить актуальный курс. Показан ранее полученный справочный курс с указанной датой.'
      : 'Курс временно недоступен. Цена в исходной валюте сохранена.');
  if ((state.retryAfter || 0) > now.valueOf()) return stale();
  return (async () => {
    try {
      const parsed = parseCbrXml(await fetchXml(day), day);
      const saved = (await database.query(`INSERT INTO editorial_fx_rates(requested_on,effective_on,rates,fetched_at)
        VALUES($1,$2,$3,$4) ON CONFLICT(requested_on) DO UPDATE SET effective_on=excluded.effective_on,
        rates=excluded.rates,fetched_at=excluded.fetched_at
        RETURNING requested_on::text,effective_on::text,rates,fetched_at`,
        [day, parsed.effectiveOn, JSON.stringify(parsed.rates), now])).rows[0];
      state.retryAfter = undefined;
      const old = (new Date(day).valueOf() - new Date(parsed.effectiveOn).valueOf()) / 86400000 > 7;
      // Do not repeatedly refetch an unusually old but successfully read official feed.
      if (old) state.retryAfter = now.valueOf() + 6 * 3600000;
      return result(saved, old ? 'stale' : 'fresh', old ? 'Последний официальный курс старше семи дней. Используйте только как ориентир.' : null);
    } catch {
      state.retryAfter = now.valueOf() + 5 * 60000;
      return stale();
    }
  })();
}
export async function getEditorialFx(database = pool, fetchXml = fetchCbrXml, now = new Date(), state: FxState = liveState): Promise<FxRates> {
  const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(now);
  if (state.pending) {
    if (state.pendingDay === day) return state.pending;
    await state.pending;
    return getEditorialFx(database, fetchXml, now, state);
  }
  state.pendingDay = day;
  const pending = loadEditorialFx(database, fetchXml, now, state);
  state.pending = pending;
  try { return await pending; }
  finally { if (state.pending === pending) { state.pending = undefined; state.pendingDay = undefined; } }
}

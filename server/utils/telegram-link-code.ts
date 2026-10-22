import { createHmac, timingSafeEqual } from 'node:crypto';

const TTL = 10 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function issueTelegramLinkCode(owner: string, secret: string, now = Date.now()): string {
  if (!UUID.test(owner) || !Number.isSafeInteger(now) || now <= 0 || now >= 2 ** 48) {
    throw new Error('Invalid Telegram linking profile or timestamp');
  }
  // UUID + millisecond timestamp + 128-bit MAC: "link_" + code fits
  // Telegram's 64-character start parameter without introducing a new table.
  const payload = Buffer.alloc(22);
  Buffer.from(owner.replace(/-/g, ''), 'hex').copy(payload);
  payload.writeUIntBE(now, 16, 6);
  const signature = createHmac('sha256', secret).update(payload).digest().subarray(0, 16);
  return `v2_${Buffer.concat([payload, signature]).toString('base64url')}`;
}

export function verifyTelegramLinkCode(code: string, secret: string, now = Date.now()): string | null {
  try {
    let owner: string;
    let issuedAt: number;
    if (code.startsWith('v2_')) {
      const encoded = code.slice(3);
      if (!/^[A-Za-z0-9_-]{51}$/.test(encoded)) return null;
      const bytes = Buffer.from(encoded, 'base64url');
      if (bytes.length !== 38 || bytes.toString('base64url') !== encoded) return null;
      const expected = createHmac('sha256', secret).update(bytes.subarray(0, 22)).digest().subarray(0, 16);
      if (!timingSafeEqual(expected, bytes.subarray(22))) return null;
      const hex = bytes.subarray(0, 16).toString('hex');
      owner = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      issuedAt = bytes.readUIntBE(16, 6);
    } else {
      // Previously issued commands remain usable during their original TTL.
      if (!/^[A-Za-z0-9_-]{1,256}$/.test(code)) return null;
      const parts = Buffer.from(code, 'base64url').toString('utf8').split(':');
      if (parts.length !== 3) return null;
      const [id, timestamp, signature] = parts;
      if (!id || !/^\d+$/.test(timestamp) || !/^[0-9a-f]{16}$/.test(signature)) return null;
      const expected = createHmac('sha256', secret).update(`${id}:${timestamp}`).digest('hex').slice(0, 16);
      if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
      owner = id;
      issuedAt = Number(timestamp);
    }
    if (!Number.isSafeInteger(issuedAt) || issuedAt <= 0 || issuedAt > now + 30_000 || now - issuedAt > TTL) return null;
    return owner;
  } catch { return null; }
}

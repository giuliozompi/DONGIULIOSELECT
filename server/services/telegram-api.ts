import https from 'node:https';

type TelegramMethod = 'sendMessage' | 'sendPhoto' | 'sendMediaGroup';
interface ApiResponse { status: number; body: string }
export type TelegramTransport = (url: URL, body: string, timeoutMs: number) => Promise<ApiResponse>;
interface SendResult { sent: boolean; error?: string }
// Fresh IPv4 connections avoid an unusable IPv6 route or a stale pooled socket.
// Do not change process-wide DNS/TLS settings or retry an ambiguous POST.
const agent = new https.Agent({ keepAlive: false });
const MAX_RESPONSE_BYTES = 512 * 1024;

export const requestTelegramJson: TelegramTransport = (url, body, timeoutMs) =>
  new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const finish = (error?: Error, result?: ApiResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result!);
    };
    const request = https.request({
      hostname: url.hostname, port: 443, path: url.pathname,
      method: 'POST', family: 4, agent,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, response => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          request.destroy(Object.assign(new Error('Response too large'), { code: 'TELEGRAM_RESPONSE_TOO_LARGE' }));
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      response.on('end', () => finish(undefined, {
        status: response.statusCode || 502, body: Buffer.concat(chunks).toString('utf8'),
      }));
      response.on('error', error => finish(error));
      response.on('aborted', () => finish(Object.assign(new Error('Response interrupted'), { code: 'ECONNRESET' })));
    });
    request.on('error', error => finish(error));
    // An absolute deadline covers DNS, connection, TLS and reading the response.
    timer = setTimeout(() => request.destroy(Object.assign(new Error('Deadline exceeded'), { code: 'ETIMEDOUT' })), timeoutMs);
    request.end(body);
  });

const SAFE_CODES = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH',
  'ETIMEDOUT', 'ECONNRESET', 'EPIPE', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN', 'ERR_TLS_CERT_ALTNAME_INVALID',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'TELEGRAM_RESPONSE_TOO_LARGE',
]);

function networkCode(error: unknown, depth = 0): string {
  if (!error || typeof error !== 'object' || depth > 3) return 'UNKNOWN';
  const value = error as { code?: unknown; name?: string; cause?: unknown; errors?: unknown[] };
  if (typeof value.code === 'string' && SAFE_CODES.has(value.code)) return value.code;
  if (value.name === 'TimeoutError' || value.name === 'AbortError') return 'ETIMEDOUT';
  for (const nested of [value.cause, ...(Array.isArray(value.errors) ? value.errors.slice(0, 5) : [])]) {
    const code = networkCode(nested, depth + 1);
    if (code !== 'UNKNOWN') return code;
  }
  return 'UNKNOWN';
}

function networkDescription(code: string): string {
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) return `не удалось определить адрес api.telegram.org — ошибка DNS (${code}).`;
  if (['ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH'].includes(code)) return `сервер магазина не может подключиться к api.telegram.org (${code}). Проверьте доступ к Telegram с хостинга.`;
  if (code.includes('CERT') || code.includes('TLS') || code.includes('ISSUER') || code.includes('SIGNATURE')) {
    return `ошибка защищённого соединения TLS (${code}). Проверьте сертификаты и время на сервере.`;
  }
  if (code === 'TELEGRAM_RESPONSE_TOO_LARGE') return 'API вернул слишком большой ответ. Отправка не подтверждена.';
  const uncertain = 'Отправка не подтверждена; проверьте чат перед повторным ручным отправлением.';
  if (code === 'ETIMEDOUT' || code.includes('TIMEOUT')) return `истекло время ожидания API (${code}). ${uncertain}`;
  if (['ECONNRESET', 'EPIPE', 'UND_ERR_SOCKET'].includes(code)) return `соединение с API прервано (${code}). ${uncertain}`;
  return `сбой сетевого запроса к api.telegram.org. ${uncertain}`;
}

export async function sendTelegramApi(
  method: TelegramMethod,
  payload: Record<string, unknown>,
  options: {
    token?: string;
    transport?: TelegramTransport;
    log?: (event: Record<string, unknown>) => void;
  } = {},
): Promise<SendResult> {
  const token = options.token ?? process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { sent: false, error: 'Telegram: токен бота не настроен.' };
  const log = options.log ?? (event => console.error('[Telegram API]', event));
  let response: ApiResponse;
  try {
    response = await (options.transport ?? requestTelegramJson)(
      new URL(`https://api.telegram.org/bot${token}/${method}`),
      JSON.stringify(payload), method === 'sendMessage' ? 15000 : 30000,
    );
  } catch (error) {
    const code = networkCode(error);
    log({ method, category: 'transport', code });
    return { sent: false, error: `Telegram: ${networkDescription(code)}` };
  }

  let data: { ok?: unknown; description?: unknown; error_code?: unknown; parameters?: { retry_after?: unknown } } | null;
  try {
    data = JSON.parse(response.body);
    if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.ok !== 'boolean') throw new Error('Invalid envelope');
  } catch {
    log({ method, category: 'invalid_response', httpStatus: response.status });
    return { sent: false, error: `Telegram: API вернул некорректный ответ (HTTP ${response.status}). Отправка не подтверждена; проверьте доступ к Telegram с сервера хостинга.` };
  }
  if (response.status >= 200 && response.status < 300 && data.ok === true) return { sent: true };

  log({ method, category: 'api_rejection', httpStatus: response.status });
  // Never log raw provider responses, request bodies, URLs or error objects:
  // Bot API URLs contain the credential and bodies can contain payment links.
  const description = typeof data.description === 'string'
    ? data.description.split(token).join('[redacted]').replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot[redacted]').slice(0, 300)
    : `HTTP ${response.status}`;
  const wait = data.parameters?.retry_after;
  const retry = typeof wait === 'number' && Number.isInteger(wait) && wait > 0 && wait <= 86400
    ? ` Повторите не ранее чем через ${wait} сек.` : '';
  return { sent: false, error: `Telegram: ${description}${retry}` };
}

import OpenAI from 'openai';
import { editorialForbiddenReason } from './editorial-ai-forbidden';
import { DEFAULT_EDITORIAL_AI_MODEL, EditorialModelError, getEditorialModelSettings, type EditorialAiProvider } from './editorial-ai-config';
export { DEFAULT_EDITORIAL_AI_MODEL, EditorialModelError, getEditorialModelSettings };
export const EDITORIAL_MAX_OUTPUT_TOKENS = 6000;
export const EDITORIAL_DRAFT_MAX_OUTPUT_TOKENS = 12000;
export type EditorialModelOptions = { purpose?: 'draft' };

// Read only bounded numeric counters, never provider text or arbitrary metadata.
function tokenUsageDiagnostic(usage: unknown): string {
  if (!usage || typeof usage !== 'object') return '';
  const value = usage as Record<string, unknown>;
  const details = value.completion_tokens_details;
  const counters = [
    ['вход', value.prompt_tokens],
    ['выход', value.completion_tokens],
    ['рассуждение', details && typeof details === 'object'
      ? (details as Record<string, unknown>).reasoning_tokens : undefined],
  ] as const;
  const safe = counters.filter(([, count]) => typeof count === 'number'
    && Number.isSafeInteger(count) && count >= 0 && count <= 1_000_000_000);
  return safe.length ? ` Счётчики сервиса (токены): ${safe.map(([label, count]) => `${label}: ${count}`).join(', ')}.` : '';
}
// Accept only a complete JSON document, optionally inside one Markdown fence.
// Never repair syntax, extract a substring, or accept incomplete model output.
export function parseEditorialJson(content: string): unknown {
  const trimmed = content.trim();
  const fence = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i.exec(trimmed);
  const document = fence ? fence[1].trim() : trimmed;
  try {
    const parsed: unknown = JSON.parse(document);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('Expected an object');
    return parsed;
  } catch {
    const format = trimmed.startsWith('```') ? 'блок Markdown'
      : document.startsWith('{') ? 'синтаксис JSON' : 'ответ не является объектом JSON';
    throw new EditorialModelError(`AI вернул некорректный JSON (${format}). Заготовка не сохранена; повторите запрос явно.`);
  }
}
// Only allowlisted diagnostics reach the operator/audit log. Never include
// provider messages, response bodies, headers or request configuration.
export function editorialProviderError(error: unknown, provider: EditorialAiProvider = 'openrouter'): EditorialModelError {
  if (error instanceof EditorialModelError) return error;
  const label = provider === 'timeweb' ? 'Timeweb AI Gateway' : 'OpenRouter';
  const status = error instanceof OpenAI.APIError ? error.status : undefined;
  const messages: Record<number, string> = {
    400: 'AI отклонил параметры запроса. Администратору нужно проверить совместимость модели и формата JSON.',
    401: `${label} отклонил ключ API. Администратору нужно проверить настройку ключа на Timeweb.`,
    402: `${label} отклонил запрос из-за оплаты или недостаточного баланса. Проверьте баланс и лимит расходов ключа.`,
    403: `${label} запретил доступ. Проверьте разрешения ключа и доступность модели для сервера Timeweb.`,
    404: 'Модель AI не найдена или недоступна. Администратору нужно проверить настройку модели.',
    408: 'Истекло время ожидания ответа AI. Повторите запрос явно позже.',
    422: 'AI отклонил параметры запроса. Администратору нужно проверить совместимость модели и формата JSON.',
    429: 'Превышен лимит запросов AI. Подождите и повторите запрос явно.',
  };
  let message = provider === 'openrouter' && status === 403 && error instanceof OpenAI.APIError
    ? editorialForbiddenReason(error.error, error.headers?.get('content-type')?.toLowerCase().includes('text/html') ?? false)
    : undefined;
  message ||= status ? messages[status] : undefined;
  if (!message && status && status >= 500) message = 'Сервис AI временно недоступен. Повторите запрос явно позже.';
  if (!message && error instanceof OpenAI.APIConnectionTimeoutError)
    message = 'Истекло время ожидания ответа AI. Повторите запрос явно позже.';
  if (!message && error instanceof OpenAI.APIConnectionError)
    message = `Не удалось соединиться с ${label}. Проверьте доступ к сервису с сервера Timeweb.`;
  return new EditorialModelError(message || 'Неизвестная ошибка сервиса AI. Обратитесь к администратору; повторите запрос только явно.');
}
export function createEditorialModelRequester(client: OpenAI, settings = getEditorialModelSettings()) {
  return async (system: string, input: unknown, options?: EditorialModelOptions): Promise<unknown> => {
    const maxTokens = options?.purpose === 'draft' ? EDITORIAL_DRAFT_MAX_OUTPUT_TOKENS : EDITORIAL_MAX_OUTPUT_TOKENS;
    try {
      const response = await client.chat.completions.create({
        model: settings.model, temperature: 0.15, max_tokens: maxTokens,
        // Gemini 2.5 Flash supports disabling thinking: reserve the output
        // budget for the reviewed JSON draft, not hidden reasoning tokens.
        ...(settings.provider === 'openrouter' && settings.model === DEFAULT_EDITORIAL_AI_MODEL ? { reasoning: { enabled: false } } : {}),
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: `${system}\nOutput exactly one valid JSON object. No Markdown fences, commentary or trailing text. Escape quotes and newlines inside JSON strings.` }, { role: 'user', content: JSON.stringify(input) }],
      });
      // Compatible gateways can report an upstream failure in HTTP 200.
      const embedded = (response as unknown as { error?: { code?: unknown } }).error;
      if (embedded) {
        const code = typeof embedded.code === 'number' ? embedded.code
          : typeof embedded.code === 'string' && /^[45]\d{2}$/.test(embedded.code) ? Number(embedded.code) : undefined;
        throw OpenAI.APIError.generate(code, { error: embedded }, undefined, new Headers());
      }
      const choice = response.choices?.[0];
      if (choice?.finish_reason === 'length')
        throw new EditorialModelError(`AI превысил лимит длины ответа (${maxTokens} токенов) и не завершил JSON. Незавершённый текст не принят; статья не изменена. Автоматического повтора нет. Если ошибка повторяется, сообщите администратору.${tokenUsageDiagnostic(response.usage)}`);
      if (choice?.finish_reason === 'content_filter' || choice?.message?.refusal)
        throw new EditorialModelError('AI отказался подготовить ответ. Проверьте название и источники перед новым явным запросом.');
      if (choice?.finish_reason !== 'stop' || !choice.message.content?.trim())
        throw new EditorialModelError('AI вернул пустой или незавершённый ответ. Заготовка не сохранена; повторите явно.');
      return parseEditorialJson(choice.message.content);
    } catch (error) {
      throw editorialProviderError(error, settings.provider);
    }
  };
}
export function createConfiguredEditorialRequester(
  env: Record<string, string | undefined> = process.env,
  fetcher?: typeof fetch,
) {
  const settings = getEditorialModelSettings(env);
  const apiKey = env[settings.keyName]?.trim();
  if (!apiKey) throw new EditorialModelError(`AI не настроен: отсутствует ${settings.keyName}. Обратитесь к администратору.`);
  const client = new OpenAI({
    baseURL: settings.baseURL, apiKey,
    ...(fetcher ? { fetch: fetcher } : {}),
    maxRetries: 0, timeout: 45_000,
  });
  return createEditorialModelRequester(client, settings);
}
export async function requestEditorialModel(system: string, input: unknown, options?: EditorialModelOptions): Promise<unknown> {
  return createConfiguredEditorialRequester()(system, input, options);
}

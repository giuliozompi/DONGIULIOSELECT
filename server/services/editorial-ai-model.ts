import OpenAI from 'openai';
import { editorialForbiddenReason } from './editorial-ai-forbidden';
export const EDITORIAL_AI_MODEL = process.env.EDITORIAL_AI_MODEL || 'openai/gpt-4o-mini';
export class EditorialModelError extends Error {}
// Only allowlisted diagnostics reach the operator/audit log. Never include
// provider messages, response bodies, headers or request configuration.
export function editorialProviderError(error: unknown): EditorialModelError {
  if (error instanceof EditorialModelError) return error;
  const status = error instanceof OpenAI.APIError ? error.status : undefined;
  const messages: Record<number, string> = {
    400: 'AI отклонил параметры запроса. Администратору нужно проверить совместимость модели и формата JSON.',
    401: 'OpenRouter отклонил ключ API. Администратору нужно проверить настройку ключа на Timeweb.',
    402: 'OpenRouter отклонил запрос из-за оплаты или недостаточного баланса. Проверьте баланс и лимит расходов ключа.',
    403: 'OpenRouter запретил доступ. Проверьте разрешения ключа и доступность модели для сервера Timeweb.',
    404: 'Модель AI не найдена или недоступна. Администратору нужно проверить настройку модели.',
    408: 'Истекло время ожидания ответа AI. Повторите запрос явно позже.',
    422: 'AI отклонил параметры запроса. Администратору нужно проверить совместимость модели и формата JSON.',
    429: 'Превышен лимит запросов AI. Подождите и повторите запрос явно.',
  };
  let message = status === 403 && error instanceof OpenAI.APIError
    ? editorialForbiddenReason(error.error, error.headers?.get('content-type')?.toLowerCase().includes('text/html') ?? false)
    : undefined;
  message ||= status ? messages[status] : undefined;
  if (!message && status && status >= 500) message = 'Сервис AI временно недоступен. Повторите запрос явно позже.';
  if (!message && error instanceof OpenAI.APIConnectionTimeoutError)
    message = 'Истекло время ожидания ответа AI. Повторите запрос явно позже.';
  if (!message && error instanceof OpenAI.APIConnectionError)
    message = 'Не удалось соединиться с OpenRouter. Проверьте доступ к сервису с сервера Timeweb.';
  return new EditorialModelError(message || 'Неизвестная ошибка сервиса AI. Обратитесь к администратору; повторите запрос только явно.');
}
export function createEditorialModelRequester(client: OpenAI) {
  return async (system: string, input: unknown): Promise<unknown> => {
    try {
      const response = await client.chat.completions.create({
        model: EDITORIAL_AI_MODEL, temperature: 0.15, max_tokens: 6000,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(input) }],
      });
      // OpenRouter can also report an upstream failure in a successful HTTP response.
      const embedded = (response as unknown as { error?: { code?: unknown } }).error;
      if (embedded) {
        const code = typeof embedded.code === 'number' ? embedded.code : undefined;
        throw OpenAI.APIError.generate(code, { error: embedded }, undefined, new Headers());
      }
      const choice = response.choices?.[0];
      if (choice?.finish_reason === 'length')
        throw new EditorialModelError('AI превысил лимит длины ответа. Попробуйте явно запросить меньше сыров; для статьи сократите число источников.');
      if (choice?.finish_reason === 'content_filter' || choice?.message?.refusal)
        throw new EditorialModelError('AI отказался подготовить ответ. Проверьте название и источники перед новым явным запросом.');
      if (choice?.finish_reason !== 'stop' || !choice.message.content?.trim())
        throw new EditorialModelError('AI вернул пустой или незавершённый ответ. Заготовка не сохранена; повторите явно.');
      try {
        return JSON.parse(choice.message.content);
      } catch {
        throw new EditorialModelError('AI вернул некорректный JSON. Заготовка не сохранена; повторите запрос явно.');
      }
    } catch (error) {
      throw editorialProviderError(error);
    }
  };
}
export async function requestEditorialModel(system: string, input: unknown): Promise<unknown> {
  if (!process.env.OPENROUTER_API_KEY) throw new EditorialModelError('AI не настроен. Обратитесь к администратору.');
  const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1', apiKey: process.env.OPENROUTER_API_KEY,
    maxRetries: 0, timeout: 45_000,
  });
  return createEditorialModelRequester(client)(system, input);
}

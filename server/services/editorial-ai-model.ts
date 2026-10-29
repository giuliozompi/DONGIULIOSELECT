import OpenAI from 'openai';
export const EDITORIAL_AI_MODEL = process.env.EDITORIAL_AI_MODEL || 'openai/gpt-4o-mini';
export class EditorialModelError extends Error {}
export async function requestEditorialModel(system: string, input: unknown): Promise<unknown> {
  if (!process.env.OPENROUTER_API_KEY) throw new EditorialModelError('AI не настроен. Обратитесь к администратору.');
  const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1', apiKey: process.env.OPENROUTER_API_KEY,
    maxRetries: 0, timeout: 45_000,
  });
  try {
    const response = await client.chat.completions.create({
      model: EDITORIAL_AI_MODEL, temperature: 0.15, max_tokens: 6000,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(input) }],
    });
    const text = response.choices[0]?.message?.content;
    if (!text || response.choices[0]?.finish_reason === 'length') throw new Error('incomplete');
    return JSON.parse(text);
  } catch {
    // No provider payloads, credentials, generic chat fallback or automatic retry.
    throw new EditorialModelError('AI не вернул полную корректную заготовку. Проверьте доступность сервиса и повторите явно.');
  }
}

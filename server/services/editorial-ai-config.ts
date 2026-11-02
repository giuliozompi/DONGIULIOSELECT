export type EditorialAiProvider = 'openrouter' | 'timeweb';
export class EditorialModelError extends Error {}
export const DEFAULT_EDITORIAL_AI_MODEL = 'google/gemini-2.5-flash';
type Environment = Record<string, string | undefined>;

// Endpoint and credential scope are fixed per provider. Merely adding a key
// must not activate a new billable service or silently redirect existing work.
export function getEditorialModelSettings(env: Environment = process.env) {
  const provider = env.EDITORIAL_AI_PROVIDER?.trim() || 'openrouter';
  if (provider !== 'openrouter' && provider !== 'timeweb')
    throw new EditorialModelError('Неизвестный провайдер AI. Проверьте EDITORIAL_AI_PROVIDER.');
  const model = env.EDITORIAL_AI_MODEL?.trim() || (provider === 'openrouter' ? DEFAULT_EDITORIAL_AI_MODEL : '');
  if (!model || !/^[a-zA-Z0-9][a-zA-Z0-9._/:-]{0,199}$/.test(model))
    throw new EditorialModelError('Укажите точный API-код модели в EDITORIAL_AI_MODEL, а не её отображаемое название.');
  return {
    provider,
    model,
    baseURL: provider === 'timeweb' ? 'https://api.timeweb.ai/v1' : 'https://openrouter.ai/api/v1',
    keyName: provider === 'timeweb' ? 'TIMEWEB_AI_API_KEY' : 'OPENROUTER_API_KEY',
  } as const;
}

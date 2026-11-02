// Provider bodies are untrusted and may echo credentials or source text.
// Inspect only known fields in memory; return static, allowlisted messages.
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
function text(value: unknown) {
  return typeof value === 'string' ? value.slice(0, 32_000) : '';
}
export function editorialForbiddenReason(payload: unknown, htmlResponse: boolean): string | undefined {
  if (htmlResponse)
    return 'HTTP 403: сервер получил HTML-страницу запрета вместо JSON OpenRouter. Причина отказа API не подтверждена; проверьте доступ с Timeweb и сетевые фильтры.';
  const error = object(payload), metadata = object(error.metadata);
  if (['openrouter_guardrail_budget', 'openrouter_workspace_budget', 'openrouter_key_limit'].includes(text(metadata.limit_source)))
    return 'OpenRouter: достигнут лимит расходов ключа, рабочего пространства или правила бюджета (403). Проверьте лимиты в OpenRouter; замена ключа не снимает общий лимит аккаунта.';
  const type = text(metadata.error_type);
  if (['content_policy_violation', 'refusal'].includes(type))
    return 'OpenRouter: запрос отклонён политикой содержимого или моделью (403). Проверьте редакционный запрос и источники; автоматического обхода или повтора нет.';
  let raw = object(metadata.raw);
  if (typeof metadata.raw === 'string' && metadata.raw.length <= 32_000) {
    try { raw = object(JSON.parse(metadata.raw)); } catch { /* Never expose unstructured raw payloads. */ }
  }
  const upstream = object(raw.error);
  const codes = [metadata.provider_code, error.code, upstream.code].map(text);
  const messages = [error.message, upstream.message].map(text).join('\n');
  if (codes.some(code => ['unsupported_country_region_territory', 'unsupported_country', 'region_not_supported'].includes(code))
    || /(?:country,?\s*region,?\s*or\s*territory\s+(?:is\s+)?not\s+supported|(?:model|service)\s+is\s+not\s+available\s+in\s+your\s+(?:country|region)|unsupported_country_region_territory)/i.test(messages))
    return 'Провайдер сообщил об ограничении страны или региона (403). Замена API-ключа не снимает это ограничение; используйте только сервис или модель, официально доступные в вашем регионе.';
  if (/^(?:Budget limit exceeded|Key limit exceeded)\b/i.test(text(error.message)))
    return 'OpenRouter: достигнут лимит расходов (403). Проверьте лимиты ключа и аккаунта; замена ключа не гарантирует снятие ограничения.';
  if ((Array.isArray(metadata.patterns) && metadata.patterns.length > 0) || /^Request blocked:.*(?:prompt injection|content filter|guardrail)/i.test(text(error.message)))
    return 'OpenRouter: запрос заблокирован правилом безопасности (403). Проверьте назначенные ключу правила и текст запроса; защиты автоматически не отключаются.';
  return undefined;
}

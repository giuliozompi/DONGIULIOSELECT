// Lightweight, secret-free reporting of which optional integrations are
// configured. Used by the startup log summary and the /healthz endpoint so
// production problems (missing env vars, blank pages) are easy to spot.
// IMPORTANT: never expose any secret values here, only "configured" booleans.

export interface IntegrationStatus {
  name: string;
  configured: boolean;
}

export function getIntegrationStatuses(): IntegrationStatus[] {
  const has = (...keys: string[]) => keys.every((k) => !!process.env[k]);

  return [
    { name: "YooKassa", configured: has("YOOKASSA_SHOP_ID", "YOOKASSA_SECRET_KEY") },
    { name: "Telegram", configured: has("TELEGRAM_BOT_TOKEN") },
    { name: "Resend", configured: has("RESEND_API_KEY") },
    { name: "DaData", configured: has("DADATA_API_TOKEN") },
    {
      name: "CDEK",
      configured:
        has("CDEK_CLIENT_ID", "CDEK_CLIENT_SECRET") ||
        process.env.CDEK_TEST_MODE === "true",
    },
    { name: "YandexDostavka", configured: has("YANDEX_DOSTAVKA_TOKEN") },
    {
      name: "YandexGo",
      configured:
        has("YANDEX_GO_TOKEN") ||
        has("YANDEX_GO_CLIENT_ID", "YANDEX_GO_CLIENT_SECRET"),
    },
    { name: "OpenRouter", configured: has("OPENROUTER_API_KEY") },
    {
      name: "WhatsApp",
      configured: has("WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN"),
    },
  ];
}

// Returns a single-line, secret-free summary suitable for startup logging, e.g.
// "Integrations — configured: YooKassa, Telegram | missing: Resend, CDEK"
export function getIntegrationsSummary(): string {
  const statuses = getIntegrationStatuses();
  const configured = statuses.filter((s) => s.configured).map((s) => s.name);
  const missing = statuses.filter((s) => !s.configured).map((s) => s.name);
  return (
    `Integrations — configured: ${configured.length ? configured.join(", ") : "(none)"}` +
    ` | missing: ${missing.length ? missing.join(", ") : "(none)"}`
  );
}

// Compact object form for JSON payloads (e.g. /healthz).
export function getIntegrationsMap(): Record<string, boolean> {
  return Object.fromEntries(
    getIntegrationStatuses().map((s) => [s.name, s.configured]),
  );
}

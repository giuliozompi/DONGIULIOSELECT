export type TelegramDiagnosticCategory =
  | 'ok' | 'dns' | 'tls' | 'timeout' | 'refused'
  | 'invalid_token' | 'not_configured' | 'invalid_response' | 'unavailable';

export interface TelegramDiagnosticResult {
  ok: boolean;
  durationMs: number;
  category: TelegramDiagnosticCategory;
}

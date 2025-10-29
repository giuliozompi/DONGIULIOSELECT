import { nanoid } from 'nanoid';

/**
 * Yandex Integration Utilities
 * Best practices from Yandex API documentation for production-ready integration
 */

// ===== IDEMPOTENCY =====

/**
 * Generate idempotency key for Yandex API requests
 * Used to prevent duplicate orders during network retries
 */
export function generateIdempotencyKey(prefix: string = 'don-giulio'): string {
  return `${prefix}-${Date.now()}-${nanoid(16)}`;
}

/**
 * Generate request_id for Yandex claim creation
 * Format: prefix-timestamp-random
 */
export function generateRequestId(prefix: string = 'don-giulio'): string {
  return `${prefix}-${Date.now()}-${nanoid(12)}`;
}

// ===== CORRELATION ID =====

/**
 * Generate correlation ID to track entire delivery flow
 * Used to correlate: price calculation → claim creation → status updates
 */
export function generateCorrelationId(): string {
  return `corr-${Date.now()}-${nanoid(16)}`;
}

// ===== RETRY LOGIC =====

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableStatuses: number[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000, // 1 second
  maxDelayMs: 10000, // 10 seconds
  retryableStatuses: [408, 429, 500, 502, 503, 504],
};

/**
 * Calculate exponential backoff delay with jitter
 * Prevents thundering herd problem when many requests retry simultaneously
 */
function calculateBackoff(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
  // Add random jitter (±25%)
  const jitter = cappedDelay * (0.75 + Math.random() * 0.5);
  return Math.round(jitter);
}

/**
 * Sleep utility for delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry wrapper with exponential backoff and jitter
 * Automatically retries on 5xx errors and timeouts
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  correlationId?: string
): Promise<T> {
  const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
    try {
      const result = await fn();
      
      if (attempt > 0) {
        console.log(`[Retry Success] ${correlationId || 'unknown'}: Succeeded on attempt ${attempt + 1}`);
      }
      
      return result;
    } catch (error: any) {
      lastError = error;
      
      // Check if error is retryable
      const isRetryable = error.status && finalConfig.retryableStatuses.includes(error.status);
      const hasRetriesLeft = attempt < finalConfig.maxRetries;
      
      if (!isRetryable || !hasRetriesLeft) {
        console.error(`[Retry Failed] ${correlationId || 'unknown'}: Not retryable or no retries left`, {
          attempt: attempt + 1,
          isRetryable,
          hasRetriesLeft,
          error: error.message
        });
        throw error;
      }
      
      // Calculate backoff delay
      const delayMs = calculateBackoff(attempt, finalConfig);
      
      console.warn(`[Retry Attempt] ${correlationId || 'unknown'}: Retrying after ${delayMs}ms`, {
        attempt: attempt + 1,
        maxRetries: finalConfig.maxRetries,
        status: error.status,
        message: error.message
      });
      
      await sleep(delayMs);
    }
  }

  throw lastError || new Error('Retry failed without error');
}

// ===== VALIDATION =====

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate coordinates (must be non-null and not [0,0])
 */
export function validateCoordinates(
  coords: [number, number] | null | undefined,
  fieldName: string = 'coordinates'
): ValidationResult {
  const errors: string[] = [];

  if (!coords) {
    errors.push(`${fieldName} sono richieste`);
    return { valid: false, errors };
  }

  const [lon, lat] = coords;

  if (lon === 0 && lat === 0) {
    errors.push(`${fieldName} non valide (0,0)`);
  }

  if (lon < -180 || lon > 180) {
    errors.push(`Longitudine non valida: ${lon} (deve essere tra -180 e 180)`);
  }

  if (lat < -90 || lat > 90) {
    errors.push(`Latitudine non valida: ${lat} (deve essere tra -90 e 90)`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate package dimensions and weight
 */
export function validatePackage(item: {
  weight?: number;
  size?: { length: number; width: number; height: number };
}): ValidationResult {
  const errors: string[] = [];

  // Weight validation
  if (item.weight !== undefined) {
    if (item.weight <= 0) {
      errors.push(`Peso non valido: ${item.weight}kg (deve essere > 0)`);
    }
    if (item.weight > 1000) {
      errors.push(`Peso troppo elevato: ${item.weight}kg (massimo 1000kg)`);
    }
  }

  // Size validation
  if (item.size) {
    const { length, width, height } = item.size;
    
    if (length <= 0 || width <= 0 || height <= 0) {
      errors.push(`Dimensioni non valide: ${length}x${width}x${height}m (tutte devono essere > 0)`);
    }
    
    // Check max dimensions (reasonable limits)
    const maxDimension = 5; // 5 meters
    if (length > maxDimension || width > maxDimension || height > maxDimension) {
      errors.push(`Dimensioni troppo grandi: ${length}x${width}x${height}m (massimo ${maxDimension}m per lato)`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ===== STRUCTURED LOGGING =====

export interface YandexLogContext {
  correlationId?: string;
  requestId?: string;
  idempotencyKey?: string;
  service: 'yandex-go' | 'yandex-dostavka';
  operation: string;
  orderId?: string;
  claimId?: string;
}

/**
 * Structured logger for Yandex API operations
 */
export class YandexLogger {
  private context: YandexLogContext;

  constructor(context: YandexLogContext) {
    this.context = context;
  }

  private formatLog(level: string, message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      service: this.context.service,
      operation: this.context.operation,
      correlationId: this.context.correlationId,
      requestId: this.context.requestId,
      idempotencyKey: this.context.idempotencyKey,
      orderId: this.context.orderId,
      claimId: this.context.claimId,
      message,
      data,
    };

    const prefix = `[${level}] [${this.context.service}:${this.context.operation}]`;
    const suffix = this.context.correlationId ? ` [corr:${this.context.correlationId}]` : '';

    switch (level) {
      case 'ERROR':
        console.error(`${prefix}${suffix} ${message}`, data || '');
        break;
      case 'WARN':
        console.warn(`${prefix}${suffix} ${message}`, data || '');
        break;
      case 'INFO':
        console.log(`${prefix}${suffix} ${message}`, data || '');
        break;
      case 'DEBUG':
        console.debug(`${prefix}${suffix} ${message}`, data || '');
        break;
    }
  }

  info(message: string, data?: any): void {
    this.formatLog('INFO', message, data);
  }

  warn(message: string, data?: any): void {
    this.formatLog('WARN', message, data);
  }

  error(message: string, data?: any): void {
    this.formatLog('ERROR', message, data);
  }

  debug(message: string, data?: any): void {
    this.formatLog('DEBUG', message, data);
  }
}

// ===== API ERROR WRAPPER =====

export class YandexApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public response: string,
    public service: 'yandex-go' | 'yandex-dostavka',
    public operation: string,
    public correlationId?: string
  ) {
    super(`Yandex API error: ${status} - ${response}`);
    this.name = 'YandexApiError';
  }
}

/**
 * Wrap fetch call with error handling and logging
 */
export async function yandexFetch(
  url: string,
  options: RequestInit,
  logger: YandexLogger,
  correlationId?: string
): Promise<Response> {
  logger.info(`API Request`, {
    url,
    method: options.method,
    headers: options.headers,
  });

  const response = await fetch(url, options);

  logger.info(`API Response`, {
    status: response.status,
    statusText: response.statusText,
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(`API Error`, {
      status: response.status,
      statusText: response.statusText,
      response: errorText,
    });

    // Parse specific Yandex error for better messaging
    let errorMessage = `Yandex API error: ${response.status} - ${errorText}`;
    
    if (response.status === 403) {
      // Access denied - token doesn't have proper permissions
      errorMessage = `Token non autorizzato (403). Il token OAuth non ha i permessi per Yandex Go Доставка для бизнеса. Vai su https://b2b.taxi.yandex.net → Integrazione → Crea token con permessi "cargo:write" e "cargo:read"`;
    } else if (response.status === 401) {
      // Unauthorized - token is invalid or expired
      errorMessage = `Token non valido (401). Verifica che YANDEX_GO_TOKEN sia un token OAuth valido dal cabinet Yandex Go Доставка для бизнеса`;
    }

    const error: any = new Error(errorMessage);
    error.status = response.status;
    error.originalError = errorText;
    throw error;
  }

  return response;
}

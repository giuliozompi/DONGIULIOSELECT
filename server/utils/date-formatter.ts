/**
 * Date formatting utilities for UTC+3 (Moscow timezone)
 * All dates displayed to users and logged should use these functions
 */

/**
 * Formats a date in Moscow timezone (UTC+3) with Russian locale
 * @param date - Date to format
 * @param includeTime - Whether to include time (default: true)
 * @returns Formatted date string in Russian with МСК timezone indicator
 */
export function formatMoscowDate(date: Date | string, includeTime: boolean = true): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...(includeTime ? {
      hour: '2-digit',
      minute: '2-digit',
    } : {})
  };
  
  const formatted = d.toLocaleString('ru-RU', options);
  return includeTime ? `${formatted} МСК` : formatted;
}

/**
 * Formats a date in short format for Moscow timezone (UTC+3)
 * Example: "01.11.2025 15:30 МСК"
 */
export function formatMoscowDateShort(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  };
  
  return `${d.toLocaleString('ru-RU', options)} МСК`;
}

/**
 * Formats a date for email/WhatsApp notifications in Moscow timezone
 * Example: "1 ноября 2025 в 15:30 МСК"
 */
export function formatMoscowDateForNotification(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  const dateOptions: Intl.DateTimeFormatOptions = {
    timeZone: 'Europe/Moscow',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  };
  
  const timeOptions: Intl.DateTimeFormatOptions = {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
  };
  
  const datePart = d.toLocaleString('ru-RU', dateOptions);
  const timePart = d.toLocaleString('ru-RU', timeOptions);
  
  return `${datePart} в ${timePart} МСК`;
}

/**
 * Formats a time only in Moscow timezone
 * Example: "15:30 МСК"
 */
export function formatMoscowTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
  };
  
  return `${d.toLocaleString('ru-RU', options)} МСК`;
}

/**
 * Formats a date for logs in ISO format with Moscow timezone
 * Example: "2025-11-01T15:30:00+03:00"
 */
export function formatMoscowDateISO(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  // Get Moscow time components
  const moscowFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  const parts = moscowFormatter.formatToParts(d);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  const hour = parts.find(p => p.type === 'hour')?.value;
  const minute = parts.find(p => p.type === 'minute')?.value;
  const second = parts.find(p => p.type === 'second')?.value;
  
  return `${year}-${month}-${day}T${hour}:${minute}:${second}+03:00`;
}

/**
 * Gets current Moscow time as Date object
 */
export function getMoscowNow(): Date {
  return new Date();
}

/**
 * Formats a delivery time range for user display
 * Example: "15:30-16:00 МСК"
 */
export function formatMoscowTimeRange(startDate: Date | string, endDate: Date | string): string {
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
  
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
  };
  
  const startTime = start.toLocaleString('ru-RU', options);
  const endTime = end.toLocaleString('ru-RU', options);
  
  return `${startTime}-${endTime} МСК`;
}

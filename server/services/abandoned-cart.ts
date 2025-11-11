import { nanoid } from 'nanoid';

export interface GenerateDiscountCodeResult {
  code: string;
  percent: number;
  expiresAt: Date;
}

export function generateRandomDiscountCode(): GenerateDiscountCodeResult {
  const percent = Math.floor(Math.random() * 6) + 5;
  
  const randomSuffix = nanoid(6).toUpperCase();
  const code = `CART${percent}-${randomSuffix}`;
  
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);
  
  return {
    code,
    percent,
    expiresAt,
  };
}

export function generateRandomReminderDelay(): Date {
  // PRODUZIONE: Random delay tra 8-24 ore per anti-gaming
  const minHours = 8;
  const maxHours = 24;
  const hoursDelay = Math.floor(Math.random() * (maxHours - minHours + 1)) + minHours;
  
  const checkAt = new Date();
  checkAt.setHours(checkAt.getHours() + hoursDelay);
  
  return checkAt;
}

/**
 * Controlla se l'orario corrente (Moscow time UTC+3) è valido per l'invio di notifiche
 * Orari consentiti: 08:00 - 22:30
 * Orari vietati: 22:30 - 08:00 (notifiche inutili durante la notte)
 */
export function isAllowedNotificationTime(): boolean {
  const moscowTime = new Date();
  moscowTime.setHours(moscowTime.getUTCHours() + 3); // UTC+3 Moscow
  
  const hours = moscowTime.getHours();
  const minutes = moscowTime.getMinutes();
  
  // Vietato dalle 22:30 alle 08:00
  if (hours < 8) return false; // Prima delle 08:00
  if (hours === 22 && minutes >= 30) return false; // Dopo le 22:30
  if (hours === 23) return false; // Tutta la 23:xx
  
  return true; // 08:00 - 22:29 è OK
}

/**
 * Calcola il prossimo orario valido per il check (dopo le 08:00 Moscow time)
 */
export function getNextAllowedCheckTime(): Date {
  const moscowTime = new Date();
  moscowTime.setHours(moscowTime.getUTCHours() + 3); // UTC+3 Moscow
  
  const hours = moscowTime.getHours();
  
  // Se siamo tra 00:00 e 08:00, prossimo check alle 08:00 di oggi
  if (hours < 8) {
    moscowTime.setHours(8, 0, 0, 0);
    // Converti back to UTC
    const utcTime = new Date(moscowTime.getTime() - (3 * 60 * 60 * 1000));
    return utcTime;
  }
  
  // Se siamo dopo le 22:30, prossimo check alle 08:00 di domani
  if (hours >= 22 || (hours === 22 && moscowTime.getMinutes() >= 30)) {
    moscowTime.setDate(moscowTime.getDate() + 1);
    moscowTime.setHours(8, 0, 0, 0);
    // Converti back to UTC
    const utcTime = new Date(moscowTime.getTime() - (3 * 60 * 60 * 1000));
    return utcTime;
  }
  
  // Altrimenti siamo in orario valido, nessun cambio necessario
  return new Date();
}

export function isDiscountValid(expiresAt: Date): boolean {
  return new Date() < new Date(expiresAt);
}

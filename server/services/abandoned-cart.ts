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
  // TESTING MODE: Delay ridotto a ~3 minuti per test manuali
  // PRODUZIONE: Ripristinare a Math.floor(Math.random() * 17) + 20 (20-36h)
  const hoursDelay = 0.05; // ~3 minuti (0.05h)
  
  const checkAt = new Date();
  checkAt.setHours(checkAt.getHours() + hoursDelay);
  
  return checkAt;
}

export function isDiscountValid(expiresAt: Date): boolean {
  return new Date() < new Date(expiresAt);
}

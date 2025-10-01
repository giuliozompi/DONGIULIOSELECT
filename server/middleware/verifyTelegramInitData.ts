import type { Request, Response, NextFunction } from 'express';
import { createHmac } from 'crypto';
import { storage } from '../storage';

// Estendi il tipo Request per includere userId e telegramUser
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      telegramUser?: {
        id: string;
        username?: string;
        firstName?: string;
        lastName?: string;
      };
    }
  }
}

/**
 * Verifica l'autenticità dei dati Telegram WebApp
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyTelegramInitData(req: Request, res: Response, next: NextFunction) {
  try {
    const initData = req.headers['x-telegram-init-data'] as string;
    
    // In development, permetti bypass per test
    if (process.env.NODE_ENV === 'development' && !initData) {
      // Usa un utente di test in development
      const testUserId = 'test_user_123';
      req.userId = testUserId;
      req.telegramUser = {
        id: testUserId,
        username: 'test_user',
        firstName: 'Test',
        lastName: 'User',
      };
      return next();
    }
    
    if (!initData) {
      return res.status(401).json({ error: 'Missing Telegram init data' });
    }
    
    // Parse init data
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');
    
    if (!hash) {
      return res.status(401).json({ error: 'Invalid init data: missing hash' });
    }
    
    // Ottieni il bot token (deve essere configurato come secret)
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error('TELEGRAM_BOT_TOKEN non configurato');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    
    // Verifica la firma
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    
    if (calculatedHash !== hash) {
      return res.status(401).json({ error: 'Invalid init data signature' });
    }
    
    // Verifica che i dati non siano scaduti (validi per 24 ore)
    const authDate = params.get('auth_date');
    if (authDate) {
      const authTimestamp = parseInt(authDate, 10);
      const now = Math.floor(Date.now() / 1000);
      const maxAge = 24 * 60 * 60; // 24 ore
      
      if (now - authTimestamp > maxAge) {
        return res.status(401).json({ error: 'Init data expired' });
      }
    }
    
    // Estrai informazioni utente
    const userParam = params.get('user');
    if (!userParam) {
      return res.status(401).json({ error: 'Missing user data' });
    }
    
    const userData = JSON.parse(userParam);
    const telegramUserId = String(userData.id);
    
    // Crea o ottieni l'utente
    storage.getUser(telegramUserId).then(user => {
      if (!user) {
        return storage.createUser({
          id: telegramUserId,
          username: userData.username,
          firstName: userData.first_name,
          lastName: userData.last_name,
        });
      }
      return user;
    }).then(user => {
      req.userId = user.id;
      req.telegramUser = {
        id: user.id,
        username: user.username ?? undefined,
        firstName: user.firstName ?? undefined,
        lastName: user.lastName ?? undefined,
      };
      next();
    }).catch(error => {
      console.error('Error creating/fetching user:', error);
      res.status(500).json({ error: 'Internal server error' });
    });
    
  } catch (error) {
    console.error('Error verifying Telegram init data:', error);
    res.status(401).json({ error: 'Invalid init data format' });
  }
}

/**
 * Middleware opzionale per route che non richiedono autenticazione
 */
export function optionalTelegramAuth(req: Request, res: Response, next: NextFunction) {
  const initData = req.headers['x-telegram-init-data'] as string;
  
  if (!initData) {
    // Nessun init data, prosegui senza autenticazione
    return next();
  }
  
  // Se c'è init data, verifica
  verifyTelegramInitData(req, res, next);
}

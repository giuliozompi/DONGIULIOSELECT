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
    
    console.log('[Telegram Auth] Request to:', req.method, req.path);
    console.log('[Telegram Auth] Has initData:', !!initData);
    
    // In development, permetti bypass per test usando l'admin reale
    if (process.env.NODE_ENV === 'development' && !initData) {
      console.log('[Telegram Auth] Development mode bypass - using admin user');
      const adminUserId = '201331998'; // DonGiulioMoscow (admin reale)
      req.userId = adminUserId;
      req.telegramUser = {
        id: adminUserId,
        username: 'DonGiulioMoscow',
        firstName: 'Don Giulio',
        lastName: 'Moscow',
      };
      return next();
    }
    
    if (!initData) {
      console.log('[Telegram Auth] ERROR: Missing init data');
      return res.status(401).json({ error: 'Missing Telegram init data' });
    }
    
    // Parse init data
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');
    
    if (!hash) {
      console.log('[Telegram Auth] ERROR: Missing hash in init data');
      return res.status(401).json({ error: 'Invalid init data: missing hash' });
    }
    
    console.log('[Telegram Auth] InitData params:', Array.from(params.keys()));
    
    // Ottieni il bot token (deve essere configurato come secret)
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error('[Telegram Auth] ERROR: TELEGRAM_BOT_TOKEN non configurato');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    
    // Verifica la firma
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    
    console.log('[Telegram Auth] Hash verification:', {
      provided: hash.substring(0, 10) + '...',
      calculated: calculatedHash.substring(0, 10) + '...',
      matches: calculatedHash === hash
    });
    
    if (calculatedHash !== hash) {
      console.log('[Telegram Auth] ERROR: Invalid signature');
      return res.status(401).json({ error: 'Invalid init data signature' });
    }
    
    // Verifica che i dati non siano scaduti (validi per 24 ore)
    const authDate = params.get('auth_date');
    if (authDate) {
      const authTimestamp = parseInt(authDate, 10);
      const now = Math.floor(Date.now() / 1000);
      const maxAge = 24 * 60 * 60; // 24 ore
      const age = now - authTimestamp;
      
      console.log('[Telegram Auth] Auth date check:', {
        authTimestamp,
        now,
        ageInSeconds: age,
        maxAge,
        expired: age > maxAge
      });
      
      if (now - authTimestamp > maxAge) {
        console.log('[Telegram Auth] ERROR: Init data expired');
        return res.status(401).json({ error: 'Init data expired' });
      }
    }
    
    // Estrai informazioni utente
    const userParam = params.get('user');
    if (!userParam) {
      console.log('[Telegram Auth] ERROR: Missing user data in params');
      return res.status(401).json({ error: 'Missing user data' });
    }
    
    const userData = JSON.parse(userParam);
    const telegramUserId = String(userData.id);
    
    console.log('[Telegram Auth] User data extracted:', {
      id: telegramUserId,
      username: userData.username,
      firstName: userData.first_name
    });
    
    // Crea o ottieni l'utente
    storage.getUser(telegramUserId).then(user => {
      if (!user) {
        console.log('[Telegram Auth] Creating new user:', telegramUserId);
        return storage.createUser({
          id: telegramUserId,
          username: userData.username,
          firstName: userData.first_name,
          lastName: userData.last_name,
        });
      }
      console.log('[Telegram Auth] User found:', telegramUserId);
      return user;
    }).then(user => {
      req.userId = user.id;
      req.telegramUser = {
        id: user.id,
        username: user.username ?? undefined,
        firstName: user.firstName ?? undefined,
        lastName: user.lastName ?? undefined,
      };
      console.log('[Telegram Auth] SUCCESS: User authenticated:', user.id);
      next();
    }).catch(error => {
      console.error('[Telegram Auth] ERROR creating/fetching user:', error);
      res.status(500).json({ error: 'Internal server error' });
    });
    
  } catch (error) {
    console.error('[Telegram Auth] ERROR verifying init data:', error);
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

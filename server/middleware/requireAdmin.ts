import type { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';

// SECURITY: requireAdmin deve essere usato DOPO verifyTelegramInitData
// per garantire che req.userId sia autenticato e verificato
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  // req.userId è già impostato da verifyTelegramInitData
  const userId = req.userId;
  
  if (!userId) {
    return res.status(401).json({ error: 'Требуется авторизация Telegram' });
  }

  const isAdmin = await storage.isAdmin(userId);
  
  if (!isAdmin) {
    return res.status(403).json({ error: 'Доступ запрещен. Только для администраторов.' });
  }

  next();
}

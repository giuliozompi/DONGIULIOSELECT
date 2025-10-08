import type { Request, Response, NextFunction } from 'express';

// SECURITY: requireMasterAdmin deve essere usato DOPO verifyTelegramInitData e requireAdmin
// per garantire che l'utente sia il Master Administrator
export async function requireMasterAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = req.userId;
  const masterAdminUserId = process.env.MASTER_ADMIN_USER_ID;
  
  if (!userId) {
    return res.status(401).json({ error: 'Требуется авторизация Telegram' });
  }

  if (!masterAdminUserId) {
    console.error('MASTER_ADMIN_USER_ID non configurato nei secrets');
    return res.status(500).json({ error: 'Конфигурация сервера неполная' });
  }

  if (userId !== masterAdminUserId) {
    return res.status(403).json({ error: 'Доступ запрещен. Только для главного администратора.' });
  }

  next();
}

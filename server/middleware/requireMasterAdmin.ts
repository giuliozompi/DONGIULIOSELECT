import type { Request, Response, NextFunction } from 'express';

// SECURITY: requireMasterAdmin deve essere usato DOPO verifyTelegramInitData e requireAdmin
// per garantire che l'utente sia il Master Administrator
export async function requireMasterAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = req.userId;
  
  // Supporta fino a 3 Master Admin tramite lista separata da virgole
  const masterAdminUserIds = process.env.MASTER_ADMIN_USER_IDS || process.env.MASTER_ADMIN_USER_ID || '';
  const adminList = masterAdminUserIds.split(',').map(id => id.trim()).filter(id => id.length > 0);
  
  if (!userId) {
    return res.status(401).json({ error: 'Требуется авторизация Telegram' });
  }

  if (adminList.length === 0) {
    console.error('MASTER_ADMIN_USER_IDS o MASTER_ADMIN_USER_ID non configurato nei secrets');
    return res.status(500).json({ error: 'Конфигурация сервера неполная' });
  }

  if (!adminList.includes(userId)) {
    return res.status(403).json({ error: 'Доступ запрещен. Только для главного администратора.' });
  }

  next();
}

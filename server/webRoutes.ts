import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import path from 'path';
import multer from 'multer';
import { backfillHistoricalData } from './services/analytics-aggregation';
import cookieParser from 'cookie-parser';
import { ObjectStorageService } from './objectStorage';
import { db } from './db';
import { webUsers, webSessions, oauthAccounts, webWishlists, webAddresses, products, categories, orders, abandonedCartNotifications, welcomeNotifications, analyticsSnapshots, analyticsTopProducts, pickupAddresses, productAssociations, adminActionLogs, orderNotificationLogs, userAddresses } from '../shared/schema';
import { getAllChannelSettings, setChannelEnabled, getUserPreferences, setUserPreference } from './services/notification-settings';
import { eq, and, gt, or, ilike, desc, sql, lt, gte, lte, asc } from 'drizzle-orm';
import { storage } from './storage';
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  verifyAccessToken,
  generateVerificationToken,
  createWebSession,
  rotateRefreshToken,
  revokeSession,
  revokeAllUserSessions,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  type JwtPayload,
} from './services/web-auth';

// ─── Middleware ─────────────────────────────────────────────

export async function requireWebAdmin(req: Request, res: Response, next: any) {
  const webUser = (req as any).webUser as JwtPayload | undefined;
  if (!webUser) return res.status(401).json({ error: 'Требуется авторизация' });
  const [user] = await db.select({ isAdmin: webUsers.isAdmin, isMasterAdmin: webUsers.isMasterAdmin })
    .from(webUsers).where(eq(webUsers.id, webUser.sub));
  if (!user?.isAdmin) return res.status(403).json({ error: 'Доступ запрещён. Только для администраторов.' });
  (req as any).isWebMasterAdmin = user.isMasterAdmin;
  next();
}

export function requireWebMasterAdmin(req: Request, res: Response, next: any) {
  if (!(req as any).isWebMasterAdmin) {
    return res.status(403).json({ error: 'Доступ запрещён. Только для главного администратора.' });
  }
  next();
}

export function requireWebAuth(req: Request, res: Response, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const token = authHeader.slice(7);
  const payload = verifyAccessToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Недействительный или истёкший токен' });
  }
  (req as any).webUser = payload;
  next();
}

export function optionalWebAuth(req: Request, res: Response, next: any) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const payload = verifyAccessToken(authHeader.slice(7));
    if (payload) (req as any).webUser = payload;
  }
  next();
}

// ─── Validation Schemas ────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(8, 'Пароль минимум 8 символов'),
  firstName: z.string().min(1, 'Введите имя').max(50),
  lastName: z.string().max(50).optional(),
  marketingConsent: z.boolean().optional().default(false),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().max(50).optional(),
  phone: z.string().optional(),
  marketingConsent: z.boolean().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Пароль минимум 8 символов'),
});

const addAddressSchema = z.object({
  label: z.string().default('Дом'),
  fullAddress: z.string().min(1),
  city: z.string().min(1),
  street: z.string().optional(),
  building: z.string().optional(),
  apartment: z.string().optional(),
  postalCode: z.string().optional(),
  notes: z.string().optional(),
  isDefault: z.boolean().optional().default(false),
});

// ─── Route Registration ────────────────────────────────────

export function registerWebRoutes(app: Express) {
  app.use('/web-api', cookieParser());

  // ── AUTH ──────────────────────────────────────────────────

  // POST /web-api/auth/register
  app.post('/web-api/auth/register', async (req: Request, res: Response) => {
    try {
      const body = registerSchema.parse(req.body);

      const existing = await db.select({ id: webUsers.id }).from(webUsers)
        .where(eq(webUsers.email, body.email));
      if (existing.length > 0) {
        return res.status(409).json({ error: 'Email уже зарегистрирован' });
      }

      const passwordHash = await hashPassword(body.password);
      const verificationToken = generateVerificationToken();
      const verificationTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const [user] = await db.insert(webUsers).values({
        id: randomUUID(),
        email: body.email,
        passwordHash,
        firstName: body.firstName,
        lastName: body.lastName || null,
        isEmailVerified: false,
        verificationToken,
        verificationTokenExpiresAt,
        marketingConsent: body.marketingConsent ?? false,
      }).returning();

      // TODO: send verification email via Resend
      console.log(`[WebAuth] New user registered: ${user.email} (${user.id})`);
      console.log(`[WebAuth] Verification token: ${verificationToken}`);

      const { refreshToken, expiresAt } = await createWebSession(
        user.id,
        req.headers['user-agent'],
        req.ip
      );
      const accessToken = generateAccessToken(user);
      setRefreshTokenCookie(res, refreshToken, expiresAt);

      return res.status(201).json({
        accessToken,
        user: sanitizeUser(user),
        message: 'Регистрация успешна. Подтвердите email.',
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors[0].message });
      }
      console.log('[WebAuth] Register error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  // POST /web-api/auth/login
  app.post('/web-api/auth/login', async (req: Request, res: Response) => {
    try {
      const body = loginSchema.parse(req.body);

      const users = await db.select().from(webUsers).where(eq(webUsers.email, body.email));
      const user = users[0];
      if (!user || !user.passwordHash) {
        return res.status(401).json({ error: 'Неверный email или пароль' });
      }

      const valid = await verifyPassword(body.password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: 'Неверный email или пароль' });
      }

      const { refreshToken, expiresAt } = await createWebSession(
        user.id,
        req.headers['user-agent'],
        req.ip
      );
      const accessToken = generateAccessToken(user);
      setRefreshTokenCookie(res, refreshToken, expiresAt);

      return res.json({ accessToken, user: sanitizeUser(user) });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors[0].message });
      }
      console.log('[WebAuth] Login error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  // POST /web-api/auth/refresh
  app.post('/web-api/auth/refresh', async (req: Request, res: Response) => {
    try {
      const oldRefreshToken = req.cookies?.web_refresh_token;
      if (!oldRefreshToken) {
        return res.status(401).json({ error: 'Сессия истекла' });
      }

      const result = await rotateRefreshToken(oldRefreshToken);
      if (!result) {
        clearRefreshTokenCookie(res);
        return res.status(401).json({ error: 'Сессия истекла. Войдите снова.' });
      }

      const users = await db.select().from(webUsers).where(eq(webUsers.id, result.userId));
      const user = users[0];
      if (!user) {
        clearRefreshTokenCookie(res);
        return res.status(401).json({ error: 'Пользователь не найден' });
      }

      const accessToken = generateAccessToken(user);
      setRefreshTokenCookie(res, result.refreshToken, result.expiresAt);

      return res.json({ accessToken, user: sanitizeUser(user) });
    } catch (err) {
      console.log('[WebAuth] Refresh error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  // POST /web-api/auth/logout
  app.post('/web-api/auth/logout', async (req: Request, res: Response) => {
    try {
      const refreshToken = req.cookies?.web_refresh_token;
      if (refreshToken) await revokeSession(refreshToken);
      clearRefreshTokenCookie(res);
      return res.json({ message: 'Выход выполнен' });
    } catch (err) {
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  // GET /web-api/auth/me
  app.get('/web-api/auth/me', requireWebAuth, async (req: Request, res: Response) => {
    try {
      const payload = (req as any).webUser as JwtPayload;
      const users = await db.select().from(webUsers).where(eq(webUsers.id, payload.sub));
      const user = users[0];
      if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
      return res.json({ user: sanitizeUser(user) });
    } catch (err) {
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  // PATCH /web-api/auth/profile
  app.patch('/web-api/auth/profile', requireWebAuth, async (req: Request, res: Response) => {
    try {
      const payload = (req as any).webUser as JwtPayload;
      const body = updateProfileSchema.parse(req.body);

      const [updated] = await db.update(webUsers)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(webUsers.id, payload.sub))
        .returning();

      return res.json({ user: sanitizeUser(updated) });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  // POST /web-api/auth/change-password
  app.post('/web-api/auth/change-password', requireWebAuth, async (req: Request, res: Response) => {
    try {
      const payload = (req as any).webUser as JwtPayload;
      const body = changePasswordSchema.parse(req.body);

      const users = await db.select().from(webUsers).where(eq(webUsers.id, payload.sub));
      const user = users[0];
      if (!user?.passwordHash) return res.status(400).json({ error: 'Нет пароля' });

      const valid = await verifyPassword(body.currentPassword, user.passwordHash);
      if (!valid) return res.status(401).json({ error: 'Неверный текущий пароль' });

      const newHash = await hashPassword(body.newPassword);
      await db.update(webUsers).set({ passwordHash: newHash, updatedAt: new Date() })
        .where(eq(webUsers.id, payload.sub));

      await revokeAllUserSessions(payload.sub);
      clearRefreshTokenCookie(res);

      return res.json({ message: 'Пароль изменён. Войдите снова.' });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  // ── CATALOG (shared with Telegram, no auth required) ─────

  // GET /web-api/products?category=&search=&page=&limit=
  app.get('/web-api/products', optionalWebAuth, async (req: Request, res: Response) => {
    try {
      const { category, search, page = '1', limit = '24' } = req.query as Record<string, string>;
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(48, Math.max(1, parseInt(limit)));
      const offset = (pageNum - 1) * limitNum;

      let query = db.select().from(products).where(eq(products.isVisible, true)) as any;

      if (category) {
        query = db.select().from(products).where(
          and(eq(products.isVisible, true), eq(products.categoryId, category))
        );
      }

      if (search) {
        query = db.select().from(products).where(
          and(eq(products.isVisible, true), ilike(products.name, `%${search}%`))
        );
      }

      const allProducts = await db.select().from(products)
        .where(eq(products.isVisible, true))
        .orderBy(desc(products.sortPriority), products.name);

      let filtered = allProducts;
      if (category) filtered = filtered.filter(p => p.categoryId === category);
      if (search) filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase())
      );

      const total = filtered.length;
      const paginated = filtered.slice(offset, offset + limitNum);

      return res.json({
        products: paginated,
        pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
      });
    } catch (err) {
      console.error('❌ [web-api/products] DB error:', err);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  // GET /web-api/products/:slug
  app.get('/web-api/products/:slug', optionalWebAuth, async (req: Request, res: Response) => {
    try {
      const { slug } = req.params;
      const result = await db.select().from(products)
        .where(and(eq(products.slug, slug), eq(products.isVisible, true)));
      if (!result[0]) return res.status(404).json({ error: 'Товар не найден' });
      return res.json(result[0]);
    } catch (err) {
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  // GET /web-api/categories
  app.get('/web-api/categories', async (_req: Request, res: Response) => {
    try {
      const cats = await db.select().from(categories)
        .where(eq(categories.isVisible, true))
        .orderBy(categories.sortOrder, categories.name);
      return res.json(cats);
    } catch (err) {
      console.error('❌ [web-api/categories] DB error:', err);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  // GET /web-api/db-check — diagnostic endpoint for DB connectivity
  app.get('/web-api/db-check', async (_req: Request, res: Response) => {
    const dbUrl = process.env.DATABASE_URL ?? '';
    const dbUrlStatus = !dbUrl
      ? 'MISSING'
      : dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://')
        ? `SET (starts with: ${dbUrl.substring(0, 20)}...)`
        : `INVALID FORMAT (starts with: ${dbUrl.substring(0, 20)}...)`;

    try {
      const start = Date.now();
      await db.select({ id: categories.id }).from(categories).limit(1);
      return res.json({ status: 'ok', latencyMs: Date.now() - start, dbUrl: dbUrlStatus });
    } catch (err: any) {
      console.error('❌ [web-api/db-check] DB error:', err);
      return res.status(500).json({
        status: 'error',
        message: err?.message ?? String(err),
        code: err?.code,
        dbUrl: dbUrlStatus,
      });
    }
  });

  // ── WISHLIST ──────────────────────────────────────────────

  // GET /web-api/wishlist
  app.get('/web-api/wishlist', requireWebAuth, async (req: Request, res: Response) => {
    try {
      const { sub } = (req as any).webUser as JwtPayload;
      const items = await db.select({
        id: webWishlists.id,
        productId: webWishlists.productId,
        createdAt: webWishlists.createdAt,
        product: products,
      }).from(webWishlists)
        .leftJoin(products, eq(webWishlists.productId, products.id))
        .where(eq(webWishlists.userId, sub));
      return res.json(items);
    } catch (err) {
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  // POST /web-api/wishlist/:productId
  app.post('/web-api/wishlist/:productId', requireWebAuth, async (req: Request, res: Response) => {
    try {
      const { sub } = (req as any).webUser as JwtPayload;
      const { productId } = req.params;

      const existing = await db.select().from(webWishlists)
        .where(and(eq(webWishlists.userId, sub), eq(webWishlists.productId, productId)));
      if (existing.length > 0) {
        await db.delete(webWishlists)
          .where(and(eq(webWishlists.userId, sub), eq(webWishlists.productId, productId)));
        return res.json({ inWishlist: false });
      }

      await db.insert(webWishlists).values({ id: randomUUID(), userId: sub, productId });
      return res.json({ inWishlist: true });
    } catch (err) {
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  // ── ADDRESSES ─────────────────────────────────────────────

  // GET /web-api/addresses
  app.get('/web-api/addresses', requireWebAuth, async (req: Request, res: Response) => {
    try {
      const { sub } = (req as any).webUser as JwtPayload;
      const addrs = await db.select().from(webAddresses).where(eq(webAddresses.userId, sub));
      return res.json(addrs);
    } catch (err) {
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  // POST /web-api/addresses
  app.post('/web-api/addresses', requireWebAuth, async (req: Request, res: Response) => {
    try {
      const { sub } = (req as any).webUser as JwtPayload;
      const body = addAddressSchema.parse(req.body);

      if (body.isDefault) {
        await db.update(webAddresses).set({ isDefault: false }).where(eq(webAddresses.userId, sub));
      }

      const [addr] = await db.insert(webAddresses)
        .values({ id: randomUUID(), userId: sub, ...body })
        .returning();

      return res.status(201).json(addr);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  // DELETE /web-api/addresses/:id
  app.delete('/web-api/addresses/:id', requireWebAuth, async (req: Request, res: Response) => {
    try {
      const { sub } = (req as any).webUser as JwtPayload;
      await db.delete(webAddresses)
        .where(and(eq(webAddresses.id, req.params.id), eq(webAddresses.userId, sub)));
      return res.json({ message: 'Адрес удалён' });
    } catch (err) {
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  // ── ORDERS ───────────────────────────────────────────────

  const createOrderSchema = z.object({
    customerName: z.string().min(1),
    customerPhone: z.string().min(1),
    customerEmail: z.string().email().optional().or(z.literal('')),
    deliveryAddress: z.string().min(1),
    deliveryNotes: z.string().optional(),
    paymentMethod: z.enum(['yookassa', 'cash_on_delivery']),
    items: z.array(z.object({
      productId: z.string(),
      productName: z.string(),
      quantity: z.number().positive(),
      price: z.string(),
      unit: z.string(),
    })).min(1),
    amount: z.string(),
    promoCode: z.string().optional(),
    discountPercent: z.number().optional(),
    discount: z.string().optional(),
  });

  // POST /web-api/orders
  app.post('/web-api/orders', requireWebAuth, async (req: Request, res: Response) => {
    try {
      const { sub } = (req as any).webUser as JwtPayload;
      const body = createOrderSchema.parse(req.body);

      const [order] = await db.insert(orders).values({
        id: randomUUID(),
        userId: `web:${sub}`,
        items: body.items,
        amount: body.amount,
        discount: body.discount || '0',
        discountType: body.discountPercent ? 'percentage' : null,
        discountValue: body.discountPercent ? `${body.discountPercent}%` : null,
        customerName: body.customerName,
        customerPhone: body.customerPhone,
        customerEmail: body.customerEmail || null,
        deliveryAddress: body.deliveryAddress,
        deliveryNotes: body.deliveryNotes || null,
        paymentMethod: body.paymentMethod,
        status: 'ОФОРМЛЕН',
        spinTokensAwarded: false,
      }).returning();

      // Mark promo code as used if provided
      if (body.promoCode) {
        const code = body.promoCode.toUpperCase();
        if (code.startsWith('BENVENUTO-')) {
          await db.update(welcomeNotifications)
            .set({ status: 'used', usedInOrderId: order.id })
            .where(eq(welcomeNotifications.discountCode, code));
        } else {
          await db.update(abandonedCartNotifications)
            .set({ status: 'used', usedInOrderId: order.id })
            .where(eq(abandonedCartNotifications.discountCode, code));
        }
      }

      console.log(`[WebOrders] New order created: ${order.id} (user web:${sub}, amount: ${body.amount}₽)`);
      return res.status(201).json(order);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      console.log('[WebOrders] Create error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Ошибка создания заказа' });
    }
  });

  // GET /web-api/orders
  app.get('/web-api/orders', requireWebAuth, async (req: Request, res: Response) => {
    try {
      const { sub } = (req as any).webUser as JwtPayload;
      const userOrders = await db.select().from(orders)
        .where(eq(orders.userId, `web:${sub}`))
        .orderBy(desc(orders.createdAt));
      return res.json(userOrders);
    } catch (err) {
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  // GET /web-api/orders/:id
  app.get('/web-api/orders/:id', requireWebAuth, async (req: Request, res: Response) => {
    try {
      const { sub } = (req as any).webUser as JwtPayload;
      const result = await db.select().from(orders)
        .where(and(eq(orders.id, req.params.id), eq(orders.userId, `web:${sub}`)));
      if (!result[0]) return res.status(404).json({ error: 'Заказ не найден' });
      return res.json(result[0]);
    } catch (err) {
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  // ── PROMO CODE VALIDATION ─────────────────────────────────

  // POST /web-api/promo/validate
  app.post('/web-api/promo/validate', requireWebAuth, async (req: Request, res: Response) => {
    try {
      const { code } = z.object({ code: z.string().min(1) }).parse(req.body);
      const upperCode = code.toUpperCase().trim();
      const now = new Date();

      // Check welcome promo codes (BENVENUTO-XXXXXX)
      if (upperCode.startsWith('BENVENUTO-')) {
        const rows = await db.select().from(welcomeNotifications)
          .where(eq(welcomeNotifications.discountCode, upperCode));
        const promo = rows[0];
        if (!promo) return res.json({ valid: false, message: 'Промокод не найден' });
        if (promo.status === 'used') return res.json({ valid: false, message: 'Промокод уже использован' });
        if (promo.status === 'expired' || promo.expiresAt < now) return res.json({ valid: false, message: 'Срок действия промокода истёк' });
        return res.json({ valid: true, discountPercent: promo.discountPercent, type: 'welcome' });
      }

      // Check abandoned cart promo codes (CART7-XXXXXX style)
      const cartRows = await db.select().from(abandonedCartNotifications)
        .where(eq(abandonedCartNotifications.discountCode, upperCode));
      const cartPromo = cartRows[0];
      if (!cartPromo) return res.json({ valid: false, message: 'Промокод не найден' });
      if (cartPromo.status === 'used') return res.json({ valid: false, message: 'Промокод уже использован' });
      if (cartPromo.status === 'expired' || cartPromo.expiresAt < now) {
        return res.json({ valid: false, message: 'Срок действия промокода истёк' });
      }
      return res.json({ valid: true, discountPercent: cartPromo.discountPercent, type: 'cart' });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  // ── TELEGRAM ACCOUNT LINKING ──────────────────────────────

  // POST /web-api/auth/link-telegram  { telegramUserId, linkCode }
  // linkCode = base64(webUserId:timestamp) signed by JWT_SECRET — generated by GET /web-api/auth/telegram-link-code
  app.get('/web-api/auth/telegram-link-code', requireWebAuth, async (req: Request, res: Response) => {
    try {
      const { sub } = (req as any).webUser as JwtPayload;
      const payload = `${sub}:${Date.now()}`;
      const { createHmac } = await import('crypto');
      const secret = process.env.JWT_SECRET || 'web-jwt-secret-dev';
      const sig = createHmac('sha256', secret).update(payload).digest('hex').slice(0, 16);
      const code = Buffer.from(`${payload}:${sig}`).toString('base64url');
      return res.json({ code, botUrl: `https://t.me/dongiuliocatalog_bot?start=link_${code}` });
    } catch (err) {
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  // POST /web-api/auth/link-telegram — called internally by Telegram bot webhook
  // Requires X-Bot-Secret header: HMAC-SHA256("bot-link-v1", JWT_SECRET)
  app.post('/web-api/auth/link-telegram', async (req: Request, res: Response) => {
    try {
      // Verify caller is our bot backend
      const { createHmac: _hmac } = await import('crypto');
      const jwtSecret = process.env.JWT_SECRET || 'web-jwt-secret-dev';
      const expectedBotSecret = _hmac('sha256', jwtSecret).update('bot-link-v1').digest('hex');
      const providedBotSecret = req.headers['x-bot-secret'];
      if (!providedBotSecret || providedBotSecret !== expectedBotSecret) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const { code, telegramUserId } = z.object({
        code: z.string().min(1),
        telegramUserId: z.string().min(1),
      }).parse(req.body);

      const { createHmac } = await import('crypto');
      const secret = process.env.JWT_SECRET || 'web-jwt-secret-dev';

      let decoded: string;
      try { decoded = Buffer.from(code, 'base64url').toString('utf8'); }
      catch { return res.status(400).json({ error: 'Недействительный код' }); }

      const parts = decoded.split(':');
      if (parts.length !== 3) return res.status(400).json({ error: 'Недействительный код' });

      const [webUserId, tsStr, sig] = parts;
      const payload = `${webUserId}:${tsStr}`;
      const expectedSig = createHmac('sha256', secret).update(payload).digest('hex').slice(0, 16);
      if (sig !== expectedSig) return res.status(400).json({ error: 'Недействительный код' });

      // Code valid for 10 minutes
      if (Date.now() - parseInt(tsStr) > 10 * 60 * 1000) {
        return res.status(400).json({ error: 'Код истёк. Запросите новый.' });
      }

      // Check not already linked to another account
      const existingLink = await db.select({ id: webUsers.id }).from(webUsers)
        .where(eq(webUsers.telegramUserId, telegramUserId));
      if (existingLink.length > 0 && existingLink[0].id !== webUserId) {
        return res.status(409).json({ error: 'Этот Telegram аккаунт уже привязан к другому профилю' });
      }

      await db.update(webUsers)
        .set({ telegramUserId, updatedAt: new Date() })
        .where(eq(webUsers.id, webUserId));

      console.log(`[WebAuth] Telegram linked: webUser ${webUserId} ↔ Telegram ${telegramUserId}`);
      return res.json({ success: true, message: 'Telegram аккаунт привязан' });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  // DELETE /web-api/auth/link-telegram — unlink
  app.delete('/web-api/auth/link-telegram', requireWebAuth, async (req: Request, res: Response) => {
    try {
      const { sub } = (req as any).webUser as JwtPayload;
      await db.update(webUsers).set({ telegramUserId: null, updatedAt: new Date() })
        .where(eq(webUsers.id, sub));
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  // ── SITEMAP ───────────────────────────────────────────────

  // GET /sitemap.xml
  app.get('/sitemap.xml', async (_req: Request, res: Response) => {
    try {
      const BASE = 'https://dongiulioselect.ru';
      const allProducts = await db.select({ slug: products.slug })
        .from(products).where(eq(products.isVisible, true));
      const allCats = await db.select({ slug: categories.slug })
        .from(categories).where(eq(categories.isVisible, true));

      const staticUrls = [
        { loc: `${BASE}/web`, priority: '1.0', changefreq: 'daily' },
        { loc: `${BASE}/web/catalog`, priority: '0.9', changefreq: 'daily' },
      ];
      const catUrls = allCats.map(c => ({
        loc: `${BASE}/web/catalog?category=${c.slug}`, priority: '0.8', changefreq: 'weekly',
      }));
      const productUrls = allProducts.map(p => ({
        loc: `${BASE}/web/product/${p.slug}`,
        priority: '0.7',
        changefreq: 'weekly',
        lastmod: undefined,
      }));

      const allUrls = [...staticUrls, ...catUrls, ...productUrls];
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(u => `  <url>
    <loc>${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

      res.header('Content-Type', 'application/xml');
      return res.send(xml);
    } catch (err) {
      return res.status(500).send('<?xml version="1.0"?><error/>');
    }
  });

  // GET /robots.txt
  app.get('/robots.txt', (_req: Request, res: Response) => {
    res.type('text/plain');
    res.send(`User-agent: *
Allow: /web/
Allow: /web/catalog
Allow: /web/product/
Disallow: /api/
Disallow: /web-api/
Disallow: /web/cart
Disallow: /web/checkout
Disallow: /web/account

Sitemap: https://dongiulioselect.ru/sitemap.xml
`);
  });

  console.log('✅ [WebRoutes] Web e-commerce API routes registered at /web-api/*');

  // ═══════════════════════════════════════════════════════════
  // WEB ADMIN ROUTES  /web-api/admin/*
  // ═══════════════════════════════════════════════════════════

  function calcOrderTotal(items: any[], discountType?: string | null, discountValue?: string | null) {
    const subtotal = items.reduce((s: number, i: any) => s + parseFloat(i.price) * i.quantity, 0);
    if (!discountType || !discountValue) return { subtotal, discountAmount: 0, total: subtotal };
    const pct = discountType === 'percentage';
    const discountAmount = pct ? (subtotal * parseFloat(discountValue)) / 100 : parseFloat(discountValue);
    return { subtotal, discountAmount, total: Math.max(0, subtotal - discountAmount) };
  }

  // GET /web-api/admin/check
  app.get('/web-api/admin/check', requireWebAuth, requireWebAdmin, (req: Request, res: Response) => {
    res.json({ ok: true, isMasterAdmin: !!(req as any).isWebMasterAdmin });
  });

  // ── ANALYTICS ──────────────────────────────────────────────

  app.get('/web-api/admin/analytics/summary', requireWebAuth, requireWebAdmin, async (req: Request, res: Response) => {
    try {
      const { startDate, endDate } = z.object({ startDate: z.string(), endDate: z.string() }).parse(req.query);
      const snaps = await db.select().from(analyticsSnapshots).where(and(gte(analyticsSnapshots.snapshotDate, startDate), lte(analyticsSnapshots.snapshotDate, endDate)));
      if (!snaps.length) return res.json({ totalOrders:0,completedOrders:0,paidOrders:0,grossRevenue:'0',netRevenue:'0',totalDiscounts:'0',totalRefunds:'0',abandonedCarts:0,cartRemindersSent:0,cartRecoveryOrders:0,conversionRate:0 });
      const sum = snaps.reduce((a, s) => ({
        totalOrders: a.totalOrders+(s.totalOrders||0), completedOrders: a.completedOrders+(s.completedOrders||0),
        paidOrders: a.paidOrders+(s.paidOrders||0),
        grossRevenue: (parseFloat(a.grossRevenue)+parseFloat(s.grossRevenue||'0')).toFixed(2),
        netRevenue: (parseFloat(a.netRevenue)+parseFloat(s.netRevenue||'0')).toFixed(2),
        totalDiscounts: (parseFloat(a.totalDiscounts)+parseFloat(s.totalDiscounts||'0')).toFixed(2),
        totalRefunds: (parseFloat(a.totalRefunds)+parseFloat(s.totalRefunds||'0')).toFixed(2),
        abandonedCarts: a.abandonedCarts+(s.abandonedCarts||0), cartRemindersSent: a.cartRemindersSent+(s.cartRemindersSent||0),
        cartRecoveryOrders: a.cartRecoveryOrders+(s.cartRecoveryOrders||0),
      }), { totalOrders:0,completedOrders:0,paidOrders:0,grossRevenue:'0',netRevenue:'0',totalDiscounts:'0',totalRefunds:'0',abandonedCarts:0,cartRemindersSent:0,cartRecoveryOrders:0 });
      const conversionRate = sum.cartRemindersSent > 0 ? ((sum.cartRecoveryOrders/sum.cartRemindersSent)*100).toFixed(2) : 0;
      res.json({ ...sum, conversionRate });
    } catch(e) { res.status(500).json({ error: 'Server error' }); }
  });

  app.get('/web-api/admin/analytics/timeseries', requireWebAuth, requireWebAdmin, async (req: Request, res: Response) => {
    try {
      const { startDate, endDate } = z.object({ startDate: z.string(), endDate: z.string() }).parse(req.query);
      const rows = await db.select({ date: analyticsSnapshots.snapshotDate, orders: analyticsSnapshots.totalOrders, revenue: analyticsSnapshots.grossRevenue })
        .from(analyticsSnapshots).where(and(gte(analyticsSnapshots.snapshotDate, startDate), lte(analyticsSnapshots.snapshotDate, endDate))).orderBy(asc(analyticsSnapshots.snapshotDate));
      res.json(rows);
    } catch(e) { res.status(500).json({ error: 'Server error' }); }
  });

  app.get('/web-api/admin/analytics/top-products', requireWebAuth, requireWebAdmin, async (req: Request, res: Response) => {
    try {
      const { startDate, endDate } = z.object({ startDate: z.string(), endDate: z.string() }).parse(req.query);
      // Read directly from DELIVERED orders (ПОЛУЧЕН) for accurate top-products data
      const ordersData = await db
        .select()
        .from(orders)
        .where(and(
          gte(orders.createdAt, sql`${startDate + ' 00:00:00'}::timestamp`),
          lte(orders.createdAt, sql`${endDate + ' 23:59:59'}::timestamp`),
          eq(orders.status, 'ПОЛУЧЕН')
        ));
      const agg: Record<string, { productId: string; productName: string; totalQuantity: number; totalRevenue: number }> = {};
      for (const order of ordersData) {
        const items = (order.items as Array<{ productId?: string; productName?: string; quantity?: number; price?: string }>) || [];
        for (const item of items) {
          if (!item.productId) continue;
          const qty = parseFloat(String(item.quantity ?? 0));
          if (!qty || qty <= 0) continue;
          const price = parseFloat(String(item.price ?? 0));
          const rev = isNaN(price) ? 0 : qty * price;
          if (!agg[item.productId]) {
            agg[item.productId] = { productId: item.productId, productName: item.productName || item.productId, totalQuantity: 0, totalRevenue: 0 };
          }
          agg[item.productId].totalQuantity += qty;
          agg[item.productId].totalRevenue += rev;
        }
      }
      const result = Object.values(agg)
        .map(p => ({ ...p, totalQuantity: parseFloat(p.totalQuantity.toFixed(3)) }))
        .sort((a, b) => b.totalQuantity - a.totalQuantity)
        .slice(0, 10);
      res.json(result);
    } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
  });

  // Force-regenerate analytics snapshots (deletes existing and re-runs)
  app.post('/web-api/admin/analytics/backfill', requireWebAuth, requireWebAdmin, requireWebMasterAdmin, async (req: Request, res: Response) => {
    try {
      const { startDate, endDate } = z.object({ startDate: z.string(), endDate: z.string() }).parse(req.body);
      // Delete existing snapshots for the date range (cascade deletes top_products)
      await db.delete(analyticsSnapshots).where(
        and(gte(analyticsSnapshots.snapshotDate, startDate), lte(analyticsSnapshots.snapshotDate, endDate))
      );
      // Re-run aggregation
      await backfillHistoricalData(startDate, endDate);
      res.json({ ok: true, message: `Backfill completed for ${startDate} → ${endDate}` });
    } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
  });

  // ── CATEGORIES ─────────────────────────────────────────────

  app.get('/web-api/admin/categories', requireWebAuth, requireWebAdmin, async (_req: Request, res: Response) => {
    try { res.json(await storage.getAllCategories(true)); } catch(e) { res.status(500).json({ error: 'Server error' }); }
  });

  app.post('/web-api/admin/categories', requireWebAuth, requireWebAdmin, async (req: Request, res: Response) => {
    try {
      const body = z.object({ name: z.string().min(1), slug: z.string().min(1), imageUrl: z.string().optional(), parentId: z.string().optional(), sortOrder: z.number().optional(), isVisible: z.boolean().optional() }).parse(req.body);
      const [cat] = await db.insert(categories).values({ id: randomUUID(), ...body, isVisible: body.isVisible ?? true, sortOrder: body.sortOrder ?? 0 }).returning();
      res.status(201).json(cat);
    } catch(e) { res.status(400).json({ error: String(e) }); }
  });

  app.patch('/web-api/admin/categories/:id', requireWebAuth, requireWebAdmin, async (req: Request, res: Response) => {
    try {
      const body = z.object({ name: z.string().min(1).optional(), slug: z.string().optional(), imageUrl: z.string().optional().nullable(), parentId: z.string().optional().nullable(), sortOrder: z.number().optional(), isVisible: z.boolean().optional() }).parse(req.body);
      const [cat] = await db.update(categories).set(body).where(eq(categories.id, req.params.id)).returning();
      if (!cat) return res.status(404).json({ error: 'Not found' });
      res.json(cat);
    } catch(e) { res.status(400).json({ error: String(e) }); }
  });

  app.delete('/web-api/admin/categories/:id', requireWebAuth, requireWebAdmin, async (req: Request, res: Response) => {
    try {
      await db.delete(categories).where(eq(categories.id, req.params.id));
      res.sendStatus(204);
    } catch(e) { res.status(500).json({ error: 'Server error' }); }
  });

  // ── IMAGE UPLOAD ───────────────────────────────────────────

  const webUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (!file.mimetype.startsWith('image/')) { cb(new Error('Solo immagini')); return; }
      cb(null, true);
    },
  });

  app.post('/web-api/admin/uploads/image', requireWebAuth, requireWebAdmin, webUpload.single('image'), async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Nessun file' });

      // On external hosting (Timeweb), proxy to Replit where Object Storage sidecar is available
      const proxyBase = process.env.REPLIT_OBJECT_PROXY_URL?.replace(/\/$/, '');
      if (proxyBase) {
        const FormDataNode = (await import('form-data')).default;
        const fd = new FormDataNode();
        fd.append('image', req.file.buffer, { filename: req.file.originalname, contentType: req.file.mimetype });
        const authHeader = req.headers.authorization || '';
        const proxyRes = await fetch(`${proxyBase}/web-api/admin/uploads/image`, {
          method: 'POST',
          headers: { ...fd.getHeaders(), Authorization: authHeader },
          body: fd.getBuffer(),
        });
        const data = await proxyRes.json().catch(() => ({ error: proxyRes.statusText }));
        return res.status(proxyRes.status).json(data);
      }

      // Direct Object Storage upload (Replit environment)
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const uploadResponse = await fetch(uploadURL, {
        method: 'PUT',
        body: req.file.buffer,
        headers: { 'Content-Type': req.file.mimetype },
      });
      if (!uploadResponse.ok) throw new Error('Upload fallito');
      const normalizedPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      await objectStorageService.trySetObjectEntityAclPolicy(uploadURL, { owner: 'web-admin', visibility: 'public' });
      res.json({ path: normalizedPath });
    } catch(e) { console.error('[WEB UPLOAD]', e); res.status(500).json({ error: String(e) }); }
  });

  app.delete('/web-api/admin/uploads/image', requireWebAuth, requireWebAdmin, async (req: Request, res: Response) => {
    try {
      const { path: imagePath } = req.body;
      if (!imagePath) return res.status(400).json({ error: 'Path mancante' });
      if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) return res.json({ success: true, skipped: true });
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(imagePath);
      await objectFile.delete();
      res.json({ success: true });
    } catch(e) { console.error('[WEB DELETE IMAGE]', e); res.status(500).json({ error: String(e) }); }
  });

  // ── PRODUCTS ───────────────────────────────────────────────

  // Flatten DB product → frontend-friendly shape
  function flattenProduct(p: any) {
    const n = p.nutrition || {};
    return {
      ...p,
      description: p.descriptionFull || p.descriptionShort || '',
      oldPrice: p.priceOld || '',
      proteins: n.proteins || '',
      fats: n.fats || '',
      carbs: n.carbs || '',
      calories: n.calories || '',
      ingredients: Array.isArray(n.composition) ? n.composition.join('\n') : (n.composition || ''),
      additionalInfo: Array.isArray(n.additionalInfo) ? n.additionalInfo.join('\n') : (n.additionalInfo || ''),
    };
  }

  // Build nutrition JSONB from flat form fields
  function buildNutrition(body: any) {
    const hasAny = body.proteins || body.fats || body.carbs || body.calories || body.ingredients || body.additionalInfo;
    if (!hasAny) return null;
    return {
      proteins: body.proteins || '',
      fats: body.fats || '',
      carbs: body.carbs || '',
      calories: body.calories || '',
      composition: body.ingredients ? body.ingredients.split('\n').map((s: string) => s.trim()).filter(Boolean) : [],
      additionalInfo: body.additionalInfo ? body.additionalInfo.split('\n').map((s: string) => s.trim()).filter(Boolean) : [],
    };
  }

  app.get('/web-api/admin/products', requireWebAuth, requireWebAdmin, async (req: Request, res: Response) => {
    try {
      const categoryId = req.query.categoryId as string | undefined;
      const prods = await storage.getAllProducts({ categoryId, includeHidden: true });
      res.json(prods.map(flattenProduct));
    } catch(e) { res.status(500).json({ error: 'Server error' }); }
  });

  const productBodySchema = z.object({
    name: z.string().min(1).optional(), slug: z.string().optional(),
    description: z.string().optional().nullable(),
    price: z.string().optional(), oldPrice: z.string().optional().nullable(), unit: z.string().optional(),
    categoryId: z.string().optional(), inStock: z.boolean().optional(), isVisible: z.boolean().optional(),
    images: z.array(z.string()).optional(), sortPriority: z.number().optional(),
    requiresMarking: z.boolean().optional(),
    proteins: z.string().optional().nullable(), fats: z.string().optional().nullable(),
    carbs: z.string().optional().nullable(), calories: z.string().optional().nullable(),
    ingredients: z.string().optional().nullable(), additionalInfo: z.string().optional().nullable(),
  });

  app.post('/web-api/admin/products', requireWebAuth, requireWebAdmin, async (req: Request, res: Response) => {
    try {
      const body = productBodySchema.parse(req.body);
      const slug = body.slug || (body.name || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const nutrition = buildNutrition(body);
      const [prod] = await db.insert(products).values({
        id: randomUUID(),
        name: body.name!,
        slug,
        price: body.price || '0',
        priceOld: body.oldPrice || null,
        unit: body.unit || 'шт',
        inStock: body.inStock ?? true,
        isVisible: body.isVisible ?? true,
        images: body.images || [],
        categoryId: body.categoryId!,
        sortPriority: body.sortPriority ?? 0,
        requiresMarking: body.requiresMarking ?? false,
        descriptionFull: body.description || null,
        nutrition,
      }).returning();
      res.status(201).json(flattenProduct(prod));
    } catch(e) { res.status(400).json({ error: String(e) }); }
  });

  app.patch('/web-api/admin/products/:id', requireWebAuth, requireWebAdmin, async (req: Request, res: Response) => {
    try {
      const body = productBodySchema.parse(req.body);
      const nutrition = buildNutrition(body);
      const updateData: any = {};
      if (body.name !== undefined) updateData.name = body.name;
      if (body.slug !== undefined) updateData.slug = body.slug;
      if (body.description !== undefined) updateData.descriptionFull = body.description;
      if (body.price !== undefined) updateData.price = body.price;
      if (body.oldPrice !== undefined) updateData.priceOld = body.oldPrice || null;
      if (body.unit !== undefined) updateData.unit = body.unit;
      if (body.categoryId !== undefined) updateData.categoryId = body.categoryId;
      if (body.inStock !== undefined) updateData.inStock = body.inStock;
      if (body.isVisible !== undefined) updateData.isVisible = body.isVisible;
      if (body.images !== undefined) updateData.images = body.images;
      if (body.sortPriority !== undefined) updateData.sortPriority = body.sortPriority;
      if (body.requiresMarking !== undefined) updateData.requiresMarking = body.requiresMarking;
      if (nutrition !== null) updateData.nutrition = nutrition;
      const [prod] = await db.update(products).set(updateData).where(eq(products.id, req.params.id)).returning();
      if (!prod) return res.status(404).json({ error: 'Not found' });
      res.json(flattenProduct(prod));
    } catch(e) { res.status(400).json({ error: String(e) }); }
  });

  app.patch('/web-api/admin/products/:id/stock', requireWebAuth, requireWebAdmin, async (req: Request, res: Response) => {
    try {
      const { inStock } = z.object({ inStock: z.boolean() }).parse(req.body);
      const [prod] = await db.update(products).set({ inStock }).where(eq(products.id, req.params.id)).returning();
      res.json(prod);
    } catch(e) { res.status(400).json({ error: String(e) }); }
  });

  app.patch('/web-api/admin/products/:id/visibility', requireWebAuth, requireWebAdmin, requireWebMasterAdmin, async (req: Request, res: Response) => {
    try {
      const { isVisible } = z.object({ isVisible: z.boolean() }).parse(req.body);
      const [prod] = await db.update(products).set({ isVisible }).where(eq(products.id, req.params.id)).returning();
      res.json(prod);
    } catch(e) { res.status(400).json({ error: String(e) }); }
  });

  app.delete('/web-api/admin/products/:id', requireWebAuth, requireWebAdmin, async (req: Request, res: Response) => {
    try {
      await db.delete(products).where(eq(products.id, req.params.id));
      res.sendStatus(204);
    } catch(e) { res.status(500).json({ error: 'Server error' }); }
  });

  // ── ORDERS ─────────────────────────────────────────────────

  app.get('/web-api/admin/orders', requireWebAuth, requireWebAdmin, async (req: Request, res: Response) => {
    try {
      const { status, search } = req.query as { status?: string; search?: string };
      let allOrders = await storage.getAllOrders({ status: status && status !== 'all' ? status : undefined, limit: 500 });
      if (search) {
        const q = search.toLowerCase();
        allOrders = allOrders.filter((o: any) =>
          o.id?.toLowerCase().includes(q) ||
          o.customerName?.toLowerCase().includes(q) ||
          o.customerPhone?.toLowerCase().includes(q)
        );
      }
      res.json(allOrders);
    } catch(e) { res.status(500).json({ error: 'Server error' }); }
  });

  app.get('/web-api/admin/orders/:id', requireWebAuth, requireWebAdmin, async (req: Request, res: Response) => {
    try {
      const order = await storage.getOrderById(req.params.id);
      if (!order) return res.status(404).json({ error: 'Not found' });
      res.json(order);
    } catch(e) { res.status(500).json({ error: 'Server error' }); }
  });

  app.patch('/web-api/admin/orders/:id/status', requireWebAuth, requireWebAdmin, async (req: Request, res: Response) => {
    try {
      const { status } = z.object({
        status: z.enum(['ОФОРМЛЕН', 'СОБРАН', 'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ', 'ОПЛАЧЕН', 'ВЫЗВАН КУРЬЕР', 'ПОЛУЧЕН', 'ВОЗВРАТ', 'УДАЛЕНО']),
      }).parse(req.body);
      const { processOrderStatusChange } = await import('./services/order-status-automation');
      const result = await processOrderStatusChange(req.params.id, status);
      res.json(result.order);
    } catch(e: any) {
      if (e.message === 'Order not found') return res.status(404).json({ error: 'Not found' });
      res.status(400).json({ error: String(e) });
    }
  });

  app.post('/web-api/admin/orders/:id/update-quantity', requireWebAuth, requireWebAdmin, async (req: Request, res: Response) => {
    try {
      const { productId, newQuantity } = z.object({ productId: z.string(), newQuantity: z.number().positive() }).parse(req.body);
      const order = await storage.getOrderById(req.params.id);
      if (!order) return res.status(404).json({ error: 'Order not found' });
      const idx = order.items.findIndex((i: any) => i.productId === productId);
      if (idx === -1) return res.status(404).json({ error: 'Product not in order' });
      const newItems = [...order.items];
      newItems[idx] = { ...newItems[idx], quantity: newQuantity };
      const totals = calcOrderTotal(newItems, order.discountType, order.discountValue);
      const updated = await storage.updateOrder(req.params.id, { items: newItems, amount: totals.total.toFixed(2), discount: totals.discountAmount.toFixed(2) });
      res.json(updated);
    } catch(e) { res.status(400).json({ error: String(e) }); }
  });

  app.post('/web-api/admin/orders/:id/add-product', requireWebAuth, requireWebAdmin, async (req: Request, res: Response) => {
    try {
      const { productId, quantity } = z.object({ productId: z.string(), quantity: z.number().positive().optional() }).parse(req.body);
      const [order, product] = await Promise.all([storage.getOrderById(req.params.id), storage.getProductById(productId, true)]);
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (!product) return res.status(404).json({ error: 'Product not found' });
      const qty = quantity ?? (product.unit === 'кг' ? 0.2 : 1);
      const newItems = [...order.items, { productId: product.id, productName: product.name, quantity: qty, price: product.price, unit: product.unit }];
      const totals = calcOrderTotal(newItems, order.discountType, order.discountValue);
      const updated = await storage.updateOrder(req.params.id, { items: newItems, amount: totals.total.toFixed(2), discount: totals.discountAmount.toFixed(2) });
      res.json(updated);
    } catch(e) { res.status(400).json({ error: String(e) }); }
  });

  app.post('/web-api/admin/orders/:id/remove-product', requireWebAuth, requireWebAdmin, async (req: Request, res: Response) => {
    try {
      const { productId } = z.object({ productId: z.string() }).parse(req.body);
      const order = await storage.getOrderById(req.params.id);
      if (!order) return res.status(404).json({ error: 'Order not found' });
      const newItems = order.items.filter((i: any) => i.productId !== productId);
      const totals = calcOrderTotal(newItems, order.discountType, order.discountValue);
      const updated = await storage.updateOrder(req.params.id, { items: newItems, amount: totals.total.toFixed(2), discount: totals.discountAmount.toFixed(2) });
      res.json(updated);
    } catch(e) { res.status(400).json({ error: String(e) }); }
  });

  app.post('/web-api/admin/orders/:id/apply-discount', requireWebAuth, requireWebAdmin, async (req: Request, res: Response) => {
    try {
      const { discountType, discountValue } = z.object({ discountType: z.enum(['percentage','fixed']), discountValue: z.string() }).parse(req.body);
      const order = await storage.getOrderById(req.params.id);
      if (!order) return res.status(404).json({ error: 'Order not found' });
      const totals = calcOrderTotal(order.items, discountType, discountValue);
      const updated = await storage.updateOrder(req.params.id, { discount: totals.discountAmount.toFixed(2), discountType, discountValue, amount: totals.total.toFixed(2) });
      res.json(updated);
    } catch(e) { res.status(400).json({ error: String(e) }); }
  });

  app.delete('/web-api/admin/orders/:id', requireWebAuth, requireWebAdmin, requireWebMasterAdmin, async (req: Request, res: Response) => {
    try {
      await db.delete(orders).where(eq(orders.id, req.params.id));
      res.sendStatus(204);
    } catch(e) { res.status(500).json({ error: 'Server error' }); }
  });

  // ── CLIENTS ────────────────────────────────────────────────

  app.get('/web-api/admin/clients', requireWebAuth, requireWebAdmin, async (_req: Request, res: Response) => {
    try { res.json(await storage.getAllUsers()); } catch(e) { res.status(500).json({ error: 'Server error' }); }
  });

  app.get('/web-api/admin/clients/:id', requireWebAuth, requireWebAdmin, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ error: 'Not found' });
      const userOrders = await storage.getOrdersByUserId(req.params.id);

      // Saved addresses from user_addresses table
      const savedAddresses = await db
        .select()
        .from(userAddresses)
        .where(eq(userAddresses.userId, req.params.id))
        .orderBy(desc(userAddresses.isDefault), asc(userAddresses.createdAt));

      // Unique delivery addresses extracted from past orders
      const orderAddresses: Array<{ address: string; method: string | null; orderId: string; date: string }> = [];
      const seen = new Set<string>();
      for (const o of userOrders) {
        const addr = (o as any).deliveryAddress;
        const pvz = (o as any).cdekPvzAddress;
        const method = (o as any).deliveryMethod ?? null;
        const key = addr || pvz;
        if (key && !seen.has(key)) {
          seen.add(key);
          orderAddresses.push({ address: pvz || addr, method, orderId: o.id, date: (o as any).createdAt });
        }
      }

      res.json({ ...user, orders: userOrders, savedAddresses, orderAddresses });
    } catch(e) { res.status(500).json({ error: 'Server error' }); }
  });

  // ── LOGS ───────────────────────────────────────────────────

  app.get('/web-api/admin/action-logs', requireWebAuth, requireWebAdmin, async (_req: Request, res: Response) => {
    try {
      const logs = await db.select().from(adminActionLogs).orderBy(desc(adminActionLogs.createdAt)).limit(100);
      res.json(logs);
    } catch(e) { res.status(500).json({ error: 'Server error' }); }
  });

  app.get('/web-api/admin/notification-logs/order', requireWebAuth, requireWebAdmin, async (_req: Request, res: Response) => {
    try {
      const logs = await db.select().from(orderNotificationLogs).orderBy(desc(orderNotificationLogs.sentAt)).limit(100);
      res.json(logs);
    } catch(e) { res.status(500).json({ error: 'Server error' }); }
  });

  // ── PICKUP ADDRESSES ───────────────────────────────────────

  // Public endpoint — used on the delivery page
  app.get('/web-api/pickup-addresses', async (_req: Request, res: Response) => {
    try {
      const rows = await db.select({ id: pickupAddresses.id, label: pickupAddresses.label, fullAddress: pickupAddresses.fullAddress, city: pickupAddresses.city, contactName: pickupAddresses.contactName, contactPhone: pickupAddresses.contactPhone, isDefault: pickupAddresses.isDefault }).from(pickupAddresses).orderBy(desc(pickupAddresses.isDefault), asc(pickupAddresses.createdAt));
      res.json(rows);
    } catch(e) { res.status(500).json({ error: 'Server error' }); }
  });

  app.get('/web-api/admin/pickup-addresses', requireWebAuth, requireWebAdmin, async (_req: Request, res: Response) => {
    try {
      const rows = await db.select().from(pickupAddresses).orderBy(desc(pickupAddresses.isDefault), asc(pickupAddresses.createdAt));
      res.json(rows);
    } catch(e) { res.status(500).json({ error: 'Server error' }); }
  });

  app.post('/web-api/admin/pickup-addresses', requireWebAuth, requireWebAdmin, async (req: Request, res: Response) => {
    try {
      const body = z.object({ label: z.string().min(1), fullAddress: z.string().min(1), city: z.string().optional(), contactName: z.string().optional(), contactPhone: z.string().optional(), isDefault: z.boolean().optional() }).parse(req.body);
      if (body.isDefault) await db.update(pickupAddresses).set({ isDefault: false });
      const [row] = await db.insert(pickupAddresses).values({ id: randomUUID(), ...body, isDefault: body.isDefault ?? false }).returning();
      res.status(201).json(row);
    } catch(e) { res.status(400).json({ error: String(e) }); }
  });

  app.patch('/web-api/admin/pickup-addresses/:id', requireWebAuth, requireWebAdmin, async (req: Request, res: Response) => {
    try {
      const body = z.object({ label: z.string().optional(), fullAddress: z.string().optional(), city: z.string().optional(), contactName: z.string().optional(), contactPhone: z.string().optional(), isDefault: z.boolean().optional() }).parse(req.body);
      if (body.isDefault) await db.update(pickupAddresses).set({ isDefault: false });
      const [row] = await db.update(pickupAddresses).set(body).where(eq(pickupAddresses.id, req.params.id)).returning();
      res.json(row);
    } catch(e) { res.status(400).json({ error: String(e) }); }
  });

  app.delete('/web-api/admin/pickup-addresses/:id', requireWebAuth, requireWebAdmin, async (req: Request, res: Response) => {
    try {
      await db.delete(pickupAddresses).where(eq(pickupAddresses.id, req.params.id));
      res.sendStatus(204);
    } catch(e) { res.status(500).json({ error: 'Server error' }); }
  });

  // ── PRODUCT ASSOCIATIONS ───────────────────────────────────

  app.get('/web-api/admin/product-associations', requireWebAuth, requireWebAdmin, async (_req: Request, res: Response) => {
    try {
      const rows = await db.select().from(productAssociations);
      res.json(rows);
    } catch(e) { res.status(500).json({ error: 'Server error' }); }
  });

  app.post('/web-api/admin/product-associations', requireWebAuth, requireWebAdmin, async (req: Request, res: Response) => {
    try {
      const body = z.object({ sourceProductId: z.string(), targetProductId: z.string() }).parse(req.body);
      const [row] = await db.insert(productAssociations).values({ id: randomUUID(), ...body }).returning();
      res.status(201).json(row);
    } catch(e) { res.status(400).json({ error: String(e) }); }
  });

  app.delete('/web-api/admin/product-associations/:id', requireWebAuth, requireWebAdmin, async (req: Request, res: Response) => {
    try {
      await db.delete(productAssociations).where(eq(productAssociations.id, req.params.id));
      res.sendStatus(204);
    } catch(e) { res.status(500).json({ error: 'Server error' }); }
  });

  // ── WEB ADMIN MANAGEMENT ───────────────────────────────────

  app.get('/web-api/admin/admins', requireWebAuth, requireWebAdmin, async (_req: Request, res: Response) => {
    try {
      const admins = await db.select({ id: webUsers.id, email: webUsers.email, firstName: webUsers.firstName, lastName: webUsers.lastName, isAdmin: webUsers.isAdmin, isMasterAdmin: webUsers.isMasterAdmin, createdAt: webUsers.createdAt }).from(webUsers).where(eq(webUsers.isAdmin, true));
      res.json(admins);
    } catch(e) { res.status(500).json({ error: 'Server error' }); }
  });

  app.post('/web-api/admin/admins/promote', requireWebAuth, requireWebAdmin, requireWebMasterAdmin, async (req: Request, res: Response) => {
    try {
      const { email, isMasterAdmin: master } = z.object({ email: z.string().email(), isMasterAdmin: z.boolean().optional() }).parse(req.body);
      // Try to update existing user first
      const [existing] = await db.update(webUsers)
        .set({ isAdmin: true, isMasterAdmin: master ?? false })
        .where(eq(webUsers.email, email))
        .returning({ id: webUsers.id, email: webUsers.email, firstName: webUsers.firstName });
      if (existing) return res.json({ ...existing, created: false });
      // User doesn't have a web account yet — create it with a random password
      const tempHash = await hashPassword(randomUUID());
      const [created] = await db.insert(webUsers).values({
        email,
        passwordHash: tempHash,
        firstName: email.split('@')[0],
        isAdmin: true,
        isMasterAdmin: master ?? false,
        isEmailVerified: false,
        isPhoneVerified: false,
        marketingConsent: false,
      }).returning({ id: webUsers.id, email: webUsers.email, firstName: webUsers.firstName });
      res.json({ ...created, created: true });
    } catch(e) { res.status(400).json({ error: String(e) }); }
  });

  app.delete('/web-api/admin/admins/:id', requireWebAuth, requireWebAdmin, requireWebMasterAdmin, async (req: Request, res: Response) => {
    try {
      const webUser = (req as any).webUser as JwtPayload;
      if (req.params.id === webUser.sub) return res.status(400).json({ error: 'Cannot remove yourself' });
      await db.update(webUsers).set({ isAdmin: false, isMasterAdmin: false }).where(eq(webUsers.id, req.params.id));
      res.sendStatus(204);
    } catch(e) { res.status(500).json({ error: 'Server error' }); }
  });

  // ── Notification Settings (Master Admin only) ──────────────────────────
  app.get('/web-api/admin/notification-settings', requireWebAuth, requireWebAdmin, requireWebMasterAdmin, async (_req: Request, res: Response) => {
    try {
      const settings = await getAllChannelSettings();
      res.json(settings);
    } catch (error) {
      console.error('Error fetching notification settings:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.patch('/web-api/admin/notification-settings/:channel', requireWebAuth, requireWebAdmin, requireWebMasterAdmin, async (req: Request, res: Response) => {
    try {
      const { channel } = req.params;
      const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
      if (!['telegram', 'email', 'whatsapp'].includes(channel)) {
        return res.status(400).json({ error: 'Invalid channel' });
      }
      const webUser = (req as any).webUser;
      await setChannelEnabled(channel as any, enabled, webUser?.sub);
      res.json({ ok: true });
    } catch (error) {
      console.error('Error updating notification setting:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/web-api/admin/clients/:id/notification-prefs', requireWebAuth, requireWebAdmin, requireWebMasterAdmin, async (req: Request, res: Response) => {
    try {
      const prefs = await getUserPreferences(req.params.id);
      res.json(prefs);
    } catch (error) {
      console.error('Error fetching user notification prefs:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.patch('/web-api/admin/clients/:id/notification-prefs/:channel', requireWebAuth, requireWebAdmin, requireWebMasterAdmin, async (req: Request, res: Response) => {
    try {
      const { id, channel } = req.params;
      const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
      if (!['telegram', 'email', 'whatsapp'].includes(channel)) {
        return res.status(400).json({ error: 'Invalid channel' });
      }
      await setUserPreference(id, channel as any, enabled);
      res.json({ ok: true });
    } catch (error) {
      console.error('Error updating user notification pref:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}

// ─── Helpers ───────────────────────────────────────────────

function sanitizeUser(user: any) {
  const { passwordHash, verificationToken, resetPasswordToken, ...safe } = user;
  return safe;
}

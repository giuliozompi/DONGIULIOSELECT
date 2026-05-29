import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import cookieParser from 'cookie-parser';
import { db } from './db';
import { webUsers, webSessions, oauthAccounts, webWishlists, webAddresses, products, categories, orders, abandonedCartNotifications, welcomeNotifications } from '../shared/schema';
import { eq, and, gt, or, ilike, desc, sql, lt } from 'drizzle-orm';
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
      return res.status(500).json({ error: 'Ошибка сервера' });
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

  console.log('✅ [WebRoutes] Web e-commerce API routes registered at /web-api/*');
}

// ─── Helpers ───────────────────────────────────────────────

function sanitizeUser(user: any) {
  const { passwordHash, verificationToken, resetPasswordToken, ...safe } = user;
  return safe;
}

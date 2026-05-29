import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID, randomBytes } from 'crypto';
import { db } from '../db';
import { webUsers, webSessions, type WebUser } from '../../shared/schema';
import { eq, and, gt } from 'drizzle-orm';

const JWT_SECRET = process.env.JWT_SECRET || 'dgs-web-jwt-secret-2024-change-in-prod';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dgs-web-refresh-secret-2024-change-in-prod';
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_DAYS = 30;

export interface JwtPayload {
  sub: string;
  email?: string;
  firstName: string;
  iat?: number;
  exp?: number;
}

export function generateAccessToken(user: Pick<WebUser, 'id' | 'email' | 'firstName'>): string {
  return jwt.sign(
    { sub: user.id, email: user.email, firstName: user.firstName },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );
}

export function verifyAccessToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export function generateRefreshToken(): string {
  return randomBytes(64).toString('hex');
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateVerificationToken(): string {
  return randomBytes(32).toString('hex');
}

export async function createWebSession(
  userId: string,
  userAgent?: string,
  ipAddress?: string
): Promise<{ refreshToken: string; expiresAt: Date }> {
  const refreshToken = generateRefreshToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);

  await db.insert(webSessions).values({
    id: randomUUID(),
    userId,
    refreshToken,
    userAgent: userAgent || null,
    ipAddress: ipAddress || null,
    expiresAt,
    lastUsedAt: new Date(),
  });

  return { refreshToken, expiresAt };
}

export async function rotateRefreshToken(
  oldRefreshToken: string
): Promise<{ userId: string; refreshToken: string; expiresAt: Date } | null> {
  const now = new Date();

  const sessions = await db
    .select()
    .from(webSessions)
    .where(and(eq(webSessions.refreshToken, oldRefreshToken), gt(webSessions.expiresAt, now)));

  if (!sessions[0]) return null;

  const session = sessions[0];
  const newRefreshToken = generateRefreshToken();
  const newExpiresAt = new Date();
  newExpiresAt.setDate(newExpiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);

  await db
    .update(webSessions)
    .set({ refreshToken: newRefreshToken, expiresAt: newExpiresAt, lastUsedAt: new Date() })
    .where(eq(webSessions.id, session.id));

  return { userId: session.userId, refreshToken: newRefreshToken, expiresAt: newExpiresAt };
}

export async function revokeSession(refreshToken: string): Promise<void> {
  await db.delete(webSessions).where(eq(webSessions.refreshToken, refreshToken));
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await db.delete(webSessions).where(eq(webSessions.userId, userId));
}

export function setRefreshTokenCookie(res: any, refreshToken: string, expiresAt: Date): void {
  res.cookie('web_refresh_token', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/web-api',
  });
}

export function clearRefreshTokenCookie(res: any): void {
  res.clearCookie('web_refresh_token', { path: '/web-api' });
}

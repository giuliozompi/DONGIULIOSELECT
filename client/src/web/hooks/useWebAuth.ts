import { create } from 'zustand';
import { webApi, setAccessToken } from '../lib/webApi';

export interface WebUserProfile {
  id: string;
  email?: string;
  phone?: string;
  firstName: string;
  lastName?: string;
  avatar?: string;
  isEmailVerified: boolean;
  marketingConsent: boolean;
  telegramUserId?: string | null;
  createdAt: string;
}

interface AuthState {
  user: WebUserProfile | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
  reloadProfile: () => Promise<WebUserProfile | null>;
  unlinkTelegram: () => Promise<void>;
  updateProfile: (data: Partial<WebUserProfile>) => Promise<void>;
}

interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName?: string;
  marketingConsent?: boolean;
}

export const useWebAuth = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isLoading: true,
  isAuthenticated: false,

  login: async (email, password) => {
    const res = await webApi.post<{ accessToken: string; user: WebUserProfile }>(
      '/auth/login',
      { email, password },
      true
    );
    setAccessToken(res.accessToken);
    set({ user: res.user, accessToken: res.accessToken, isAuthenticated: true, isLoading: false });
  },

  register: async (data) => {
    const res = await webApi.post<{ accessToken: string; user: WebUserProfile }>(
      '/auth/register',
      data,
      true
    );
    setAccessToken(res.accessToken);
    set({ user: res.user, accessToken: res.accessToken, isAuthenticated: true, isLoading: false });
  },

  logout: async () => {
    await webApi.post('/auth/logout').catch(() => {});
    setAccessToken(null);
    set({ user: null, accessToken: null, isAuthenticated: false });
  },

  refresh: async () => {
    try {
      const res = await webApi.post<{ accessToken: string; user: WebUserProfile }>(
        '/auth/refresh',
        undefined,
        true
      );
      setAccessToken(res.accessToken);
      set({ user: res.user, accessToken: res.accessToken, isAuthenticated: true, isLoading: false });
      return true;
    } catch {
      setAccessToken(null);
      set({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
      return false;
    }
  },

  updateProfile: async (data) => {
    const res = await webApi.patch<{ user: WebUserProfile }>('/auth/profile', data);
    set({ user: res.user });
  },

  reloadProfile: async () => {
    const owner = get().user?.id;
    const session = get().accessToken;
    if (!owner || !get().isAuthenticated) return null;
    const res = await webApi.get<{ user: WebUserProfile }>('/auth/me');
    // Returning from Telegram must not rotate the session or resurrect a
    // logged-out profile. Ignore a response belonging to a previous account.
    const current = get();
    if (!current.isAuthenticated || current.user?.id !== owner ||
      current.accessToken !== session || res.user.id !== owner) return null;
    set({ user: res.user });
    return res.user;
  },

  unlinkTelegram: async () => {
    const owner = get().user?.id;
    const session = get().accessToken;
    if (!owner || !get().isAuthenticated) throw new Error('Требуется авторизация.');
    await webApi.delete(`/auth/link-telegram?profileId=${encodeURIComponent(owner)}`);
    const current = get();
    if (current.isAuthenticated && current.user?.id === owner && current.accessToken === session) {
      set({ user: { ...current.user, telegramUserId: null } });
    }
  },
}));

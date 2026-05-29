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
  telegramUserId?: string;
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
    set({ user: res.user, accessToken: res.accessToken, isAuthenticated: true });
  },

  register: async (data) => {
    const res = await webApi.post<{ accessToken: string; user: WebUserProfile }>(
      '/auth/register',
      data,
      true
    );
    setAccessToken(res.accessToken);
    set({ user: res.user, accessToken: res.accessToken, isAuthenticated: true });
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
}));

const BASE = '/web-api';
const STORAGE_KEY = 'dgs_web_access_token';

let _accessToken: string | null = (() => {
  try { return sessionStorage.getItem(STORAGE_KEY); } catch { return null; }
})();
let _refreshPromise: Promise<boolean> | null = null;

export function setAccessToken(token: string | null) {
  _accessToken = token;
  try {
    if (token) sessionStorage.setItem(STORAGE_KEY, token);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

export function getAccessToken() {
  return _accessToken;
}

export async function tryRefresh(): Promise<boolean> {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) { setAccessToken(null); return false; }
      const data = await res.json();
      const token = data.accessToken ?? null;
      setAccessToken(token);
      return !!token;
    } catch {
      setAccessToken(null);
      return false;
    } finally {
      _refreshPromise = null;
    }
  })();
  return _refreshPromise;
}

async function doFetch(method: string, path: string, body?: unknown, skipAuth = false): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (_accessToken && !skipAuth) headers['Authorization'] = `Bearer ${_accessToken}`;
  return fetch(`${BASE}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  skipAuth = false
): Promise<T> {
  let res = await doFetch(method, path, body, skipAuth);

  if (res.status === 401 && !skipAuth) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await doFetch(method, path, body, false);
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const webApi = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown, skipAuth = false) =>
    request<T>('POST', path, body, skipAuth),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

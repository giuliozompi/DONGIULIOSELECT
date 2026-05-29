const BASE = '/web-api';

let _accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  _accessToken = token;
}

export function getAccessToken() {
  return _accessToken;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  skipAuth = false
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (_accessToken && !skipAuth) headers['Authorization'] = `Bearer ${_accessToken}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

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

import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getTelegramInitData } from "./telegram";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    try {
      const errorData = await res.json();
      let errorMessage = errorData.message || errorData.error || res.statusText;
      
      // Se errore 401 in produzione, suggerisci di ricaricare Telegram
      if (res.status === 401 && window.location.hostname !== 'localhost') {
        errorMessage = '🔐 Sessione scaduta. Chiudi completamente Telegram e riapri l\'app per continuare.';
      }
      
      throw new Error(errorMessage);
    } catch (parseError) {
      // Se errore 401, messaggio specifico
      if (res.status === 401 && window.location.hostname !== 'localhost') {
        throw new Error('🔐 Sessione scaduta. Chiudi completamente Telegram e riapri l\'app.');
      }
      
      const text = res.statusText || 'Errore sconosciuto';
      throw new Error(text);
    }
  }
}

export function getAuthHeaders(): HeadersInit {
  const headers: HeadersInit = {};
  const initData = getTelegramInitData();
  
  if (initData) {
    headers['x-telegram-init-data'] = initData;
    console.log('[Auth Headers] InitData presente:', initData.substring(0, 50) + '...');
  } else {
    console.warn('[Auth Headers] NESSUN initData disponibile!');
  }
  
  return headers;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers = {
    ...getAuthHeaders(),
    ...(data ? { "Content-Type": "application/json" } : {}),
  };

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

function buildQueryUrl(queryKey: readonly unknown[]): string {
  if (queryKey.length === 0) {
    throw new Error('QueryKey cannot be empty');
  }

  const basePath = String(queryKey[0]);
  const segments: string[] = [basePath];
  const queryParams = new URLSearchParams();

  for (let i = 1; i < queryKey.length; i++) {
    const segment = queryKey[i];
    
    if (segment === null || segment === undefined) {
      continue;
    }
    
    if (typeof segment === 'object' && !Array.isArray(segment)) {
      for (const [key, value] of Object.entries(segment)) {
        if (value !== null && value !== undefined) {
          queryParams.append(key, String(value));
        }
      }
    } else {
      segments.push(String(segment));
    }
  }

  let url = segments.join('/');
  const queryString = queryParams.toString();
  
  if (queryString) {
    url += `?${queryString}`;
  }

  return url;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = buildQueryUrl(queryKey);
    
    const isAdminRoute = url.includes('/api/admin');
    
    const res = await fetch(url, {
      headers: getAuthHeaders(),
      credentials: "include",
      cache: isAdminRoute ? 'no-store' : 'default',
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

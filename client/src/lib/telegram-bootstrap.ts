// The storefront must never depend on an external Telegram request. Mini App
// modules capture WebApp at import time, so load the SDK before importing App.
export function needsTelegramSdk(location: Pick<Location, 'pathname' | 'hash' | 'search'>): boolean {
  if (/^\/web(?:\/|$)/.test(location.pathname)) return false;
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const search = new URLSearchParams(location.search);
  return [hash, search].some(params => params.has('tgWebAppData')
    || params.has('tgWebAppVersion') || params.has('tgWebAppPlatform'));
}

export function prepareTelegramSdk(timeoutMs = 12000): Promise<void> {
  if (!needsTelegramSdk(window.location) || window.Telegram?.WebApp) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-web-app.js';
    script.async = true;
    const finish = (success: boolean) => {
      clearTimeout(timer);
      script.onload = script.onerror = null;
      if (success) resolve();
      else {
        script.remove();
        reject(new Error('Telegram SDK unavailable'));
      }
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    script.onload = () => finish(!!window.Telegram?.WebApp);
    script.onerror = () => finish(false);
    document.head.appendChild(script);
  });
}

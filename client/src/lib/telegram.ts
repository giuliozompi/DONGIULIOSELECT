declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        ready: () => void;
        expand: () => void;
        close: () => void;
        themeParams: {
          bg_color?: string;
          text_color?: string;
          hint_color?: string;
          link_color?: string;
          button_color?: string;
          button_text_color?: string;
          secondary_bg_color?: string;
          header_bg_color?: string;
          accent_text_color?: string;
        };
        MainButton: {
          text: string;
          color: string;
          textColor: string;
          isVisible: boolean;
          isActive: boolean;
          isProgressVisible: boolean;
          setText: (text: string) => void;
          onClick: (callback: () => void) => void;
          offClick: (callback: () => void) => void;
          show: () => void;
          hide: () => void;
          enable: () => void;
          disable: () => void;
          showProgress: (leaveActive?: boolean) => void;
          hideProgress: () => void;
        };
        BackButton: {
          isVisible: boolean;
          onClick: (callback: () => void) => void;
          offClick: (callback: () => void) => void;
          show: () => void;
          hide: () => void;
        };
        HapticFeedback: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
          notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
          selectionChanged: () => void;
        };
        initDataUnsafe: {
          user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
            language_code?: string;
          };
        };
      };
    };
  }
}

export const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;

export function initTelegramApp() {
  if (tg) {
    tg.ready();
    tg.expand();
  }
}

export function useTelegramTheme() {
  const params = tg?.themeParams || {};
  
  return {
    bgColor: params.bg_color || '#ffffff',
    textColor: params.text_color || '#000000',
    hintColor: params.hint_color || '#999999',
    linkColor: params.link_color || '#2481cc',
    buttonColor: params.button_color || '#2481cc',
    buttonTextColor: params.button_text_color || '#ffffff',
    secondaryBgColor: params.secondary_bg_color || '#f4f4f4',
    headerBgColor: params.header_bg_color || '#ffffff',
    accentTextColor: params.accent_text_color || '#2481cc',
  };
}

export function hapticFeedback(style: 'light' | 'medium' | 'heavy' | 'success') {
  if (tg?.HapticFeedback) {
    if (style === 'success') {
      tg.HapticFeedback.notificationOccurred('success');
    } else {
      tg.HapticFeedback.impactOccurred(style);
    }
  }
}

export function getTelegramUser() {
  return tg?.initDataUnsafe?.user;
}

/**
 * Ottieni initData di Telegram per autenticazione backend
 */
export function getTelegramInitData(): string | undefined {
  // In un vero Telegram WebApp, questo sarebbe disponibile come query string
  // Per development/testing, usiamo un valore mock
  if (typeof window === 'undefined') return undefined;
  
  const urlParams = new URLSearchParams(window.location.hash.slice(1));
  const tgWebAppData = urlParams.get('tgWebAppData');
  
  if (tgWebAppData) {
    return decodeURIComponent(tgWebAppData);
  }
  
  // Fallback: development mode senza initData
  return undefined;
}

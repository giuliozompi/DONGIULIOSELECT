import { useEffect } from 'react';
import { tg } from '@/lib/telegram';

interface MainButtonConfig {
  text: string;
  onClick: () => void;
  show?: boolean;
  enabled?: boolean;
}

export function useTelegramMainButton(config: MainButtonConfig) {
  useEffect(() => {
    if (!tg?.MainButton) return;

    const { text, onClick, show = true, enabled = true } = config;

    tg.MainButton.setText(text);
    
    if (show) {
      tg.MainButton.show();
    } else {
      tg.MainButton.hide();
    }

    if (enabled) {
      tg.MainButton.enable();
    } else {
      tg.MainButton.disable();
    }

    tg.MainButton.onClick(onClick);

    return () => {
      if (tg?.MainButton) {
        tg.MainButton.offClick(onClick);
        tg.MainButton.hide();
      }
    };
  }, [config]);
}

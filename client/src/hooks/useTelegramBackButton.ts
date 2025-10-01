import { useEffect } from 'react';
import { tg } from '@/lib/telegram';

export function useTelegramBackButton(callback: () => void, show: boolean = true) {
  useEffect(() => {
    if (!tg?.BackButton) return;

    const handleClick = () => {
      callback();
    };

    if (show) {
      tg.BackButton.show();
      tg.BackButton.onClick(handleClick);
    } else {
      tg.BackButton.hide();
    }

    return () => {
      if (tg?.BackButton) {
        tg.BackButton.offClick(handleClick);
        tg.BackButton.hide();
      }
    };
  }, [callback, show]);
}

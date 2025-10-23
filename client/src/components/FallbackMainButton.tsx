import { Button } from '@/components/ui/button';
import { tg } from '@/lib/telegram';

interface FallbackMainButtonProps {
  text: string;
  onClick: () => void;
  enabled?: boolean;
  show?: boolean;
}

export function FallbackMainButton({ text, onClick, enabled = true, show = true }: FallbackMainButtonProps) {
  // Se siamo in Telegram WebApp con initData valido, non mostrare il pulsante fallback
  // Il pulsante fallback serve per preview/sviluppo quando NON siamo in Telegram reale
  const hasValidTelegramData = tg?.initData && tg.initData.length > 0;
  
  if (hasValidTelegramData) {
    return null;
  }

  // Se show è false, non mostrare il pulsante
  if (!show) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t p-4 pb-safe">
      <Button
        onClick={onClick}
        disabled={!enabled}
        className="w-full h-12 text-base font-semibold"
        data-testid="button-fallback-main"
      >
        {text}
      </Button>
    </div>
  );
}

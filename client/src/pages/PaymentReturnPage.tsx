import { useEffect, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ArrowLeft } from 'lucide-react';

export default function PaymentReturnPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute('/payment-return');
  const [isInTelegram, setIsInTelegram] = useState(false);

  useEffect(() => {
    // Verifica se siamo in Telegram WebApp
    const telegramWebApp = (window as any).Telegram?.WebApp;
    const hasInitData = telegramWebApp?.initData;
    
    console.log('[Payment Return] Telegram WebApp:', !!telegramWebApp);
    console.log('[Payment Return] Has initData:', !!hasInitData);
    
    if (hasInitData) {
      // Siamo già nella Mini App, redirect automatico
      console.log('[Payment Return] Already in Mini App, redirecting to /orders');
      setIsInTelegram(true);
      
      // Redirect dopo 2 secondi per mostrare il messaggio di successo
      setTimeout(() => {
        setLocation('/orders');
      }, 2000);
    } else {
      // Non siamo nella Mini App
      console.log('[Payment Return] Not in Mini App, showing instructions');
      setIsInTelegram(false);
    }
  }, [setLocation]);

  const handleBackToApp = () => {
    // Prova a chiudere la finestra (funziona se aperta da Telegram)
    const telegramWebApp = (window as any).Telegram?.WebApp;
    if (telegramWebApp) {
      telegramWebApp.close();
    } else {
      // Fallback: chiudi la finestra del browser
      window.close();
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <CardTitle className="text-2xl">Pagamento Completato!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isInTelegram ? (
            <div className="text-center space-y-3">
              <p className="text-muted-foreground">
                Verrai reindirizzato alla tua pagina degli ordini...
              </p>
              <div className="flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <p className="text-sm text-yellow-800 dark:text-yellow-200 text-center">
                  Per visualizzare il tuo ordine, torna alla <strong>Mini App di Telegram</strong>
                </p>
              </div>
              
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground text-center">
                  Come tornare alla Mini App:
                </p>
                <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                  <li>Apri Telegram sul tuo dispositivo</li>
                  <li>Vai alla chat con il bot Don Giulio</li>
                  <li>Riapri la Mini App dal menu</li>
                </ol>
              </div>

              <div className="pt-4 space-y-2">
                <Button
                  onClick={handleBackToApp}
                  className="w-full"
                  variant="default"
                  data-testid="button-close-window"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Chiudi Questa Finestra
                </Button>
                
                <p className="text-xs text-center text-muted-foreground">
                  Il tuo ordine è stato salvato e lo potrai vedere nella sezione "Заказы"
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

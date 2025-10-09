import { useEffect, ReactNode } from 'react';
import { tg } from '@/lib/telegram';

interface TelegramThemeProviderProps {
  children: ReactNode;
}

/**
 * Converte un colore hex in valore di luminosità (0-255)
 * Valori bassi = scuro, valori alti = chiaro
 * Ritorna null se il colore non è valido
 */
function hexToLightness(hex: string | undefined): number | null {
  if (!hex) return null;
  
  // Rimuovi # se presente e validare
  const cleanHex = hex.replace('#', '');
  
  // Verifica che sia un hex valido (3 o 6 caratteri)
  if (!/^[0-9A-Fa-f]{6}$/.test(cleanHex) && !/^[0-9A-Fa-f]{3}$/.test(cleanHex)) {
    return null;
  }
  
  // Espandi formato corto (es. #fff -> #ffffff)
  let fullHex = cleanHex;
  if (cleanHex.length === 3) {
    fullHex = cleanHex[0] + cleanHex[0] + cleanHex[1] + cleanHex[1] + cleanHex[2] + cleanHex[2];
  }
  
  // Converti hex in RGB
  const r = parseInt(fullHex.substring(0, 2), 16);
  const g = parseInt(fullHex.substring(2, 4), 16);
  const b = parseInt(fullHex.substring(4, 6), 16);
  
  // Verifica che i valori siano validi
  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return null;
  }
  
  // Formula per calcolare la luminosità percepita
  // Usa i coefficienti standard per la luminanza
  return (0.299 * r + 0.587 * g + 0.114 * b);
}

/**
 * Applica il tema basandosi sui parametri di Telegram
 */
function applyTelegramTheme() {
  if (!tg) return;

  const bgColor = tg.themeParams?.bg_color;
  
  // Prova prima con bg_color
  if (bgColor) {
    // Calcola la luminosità del colore di sfondo
    const lightness = hexToLightness(bgColor);
    
    // Se la luminosità è valida
    if (lightness !== null) {
      // Se la luminosità è bassa (< 128), è tema scuro
      const isDark = lightness < 128;
      
      // Applica o rimuovi la classe 'dark' dall'elemento root
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      
      // Applica anche il colore di sfondo di Telegram al body per una transizione perfetta
      document.body.style.backgroundColor = bgColor;
      return;
    }
  }
  
  // Fallback: usa colorScheme se bg_color non è disponibile o non valido
  if (tg.colorScheme) {
    if (tg.colorScheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }
}

/**
 * Provider che sincronizza il tema dell'app con il tema di Telegram (giorno/notte)
 * Si aggiorna automaticamente quando l'utente cambia tema in Telegram
 */
export function TelegramThemeProvider({ children }: TelegramThemeProviderProps) {
  useEffect(() => {
    if (!tg) return;

    // Applica il tema iniziale
    applyTelegramTheme();
    
    // Listener per aggiornamenti tema
    const handleThemeChange = () => {
      applyTelegramTheme();
    };
    
    // Registra listener per evento themeChanged
    tg.onEvent('themeChanged', handleThemeChange);
    
    // Cleanup: rimuovi listener quando il componente viene smontato
    return () => {
      if (tg?.offEvent) {
        tg.offEvent('themeChanged', handleThemeChange);
      }
    };
  }, []);

  return <>{children}</>;
}

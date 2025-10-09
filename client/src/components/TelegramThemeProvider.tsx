import { useEffect, ReactNode } from 'react';
import { tg } from '@/lib/telegram';

interface TelegramThemeProviderProps {
  children: ReactNode;
}

/**
 * Converte un colore hex in valore di luminosità (0-255)
 * Valori bassi = scuro, valori alti = chiaro
 */
function hexToLightness(hex: string): number {
  // Rimuovi # se presente
  const cleanHex = hex.replace('#', '');
  
  // Converti hex in RGB
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  
  // Formula per calcolare la luminosità percepita
  // Usa i coefficienti standard per la luminanza
  return (0.299 * r + 0.587 * g + 0.114 * b);
}

/**
 * Provider che sincronizza il tema dell'app con il tema di Telegram (giorno/notte)
 */
export function TelegramThemeProvider({ children }: TelegramThemeProviderProps) {
  useEffect(() => {
    if (!tg) return;

    const bgColor = tg.themeParams?.bg_color;
    
    if (bgColor) {
      // Calcola la luminosità del colore di sfondo
      const lightness = hexToLightness(bgColor);
      
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
    }
  }, []);

  return <>{children}</>;
}

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles } from 'lucide-react';

interface Prize {
  id?: string;
  name: string;
  type: string;
  value?: string;
  percentage?: number;
  amount?: string;
}

interface FortuneWheelProps {
  spinTokens: number;
  onSpin: () => Promise<Prize>;
}

// Icone SVG italiane custom (sostituiscono emoji)
const CheeseIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <path d="M4 20 L16 8 L28 20 L28 28 L4 28 Z" fill="#FFD700" stroke="#D4A017" strokeWidth="2"/>
    <circle cx="12" cy="18" r="2" fill="#FFA500" opacity="0.6"/>
    <circle cx="20" cy="22" r="2.5" fill="#FFA500" opacity="0.6"/>
  </svg>
);

const TomatoIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="18" r="10" fill="#FF6347" stroke="#C1440E" strokeWidth="2"/>
    <path d="M14 8 L16 4 L18 8" fill="#228B22" stroke="#1B5E20" strokeWidth="1.5"/>
  </svg>
);

const SalamiIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <ellipse cx="16" cy="16" rx="10" ry="8" fill="#8B4513" stroke="#654321" strokeWidth="2"/>
    <circle cx="13" cy="14" r="1.5" fill="#FFF" opacity="0.8"/>
    <circle cx="18" cy="16" r="1.5" fill="#FFF" opacity="0.8"/>
    <circle cx="15" cy="18" r="1.5" fill="#FFF" opacity="0.8"/>
  </svg>
);

const GrapesIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="18" r="4" fill="#8B008B"/>
    <circle cx="12" cy="14" r="3.5" fill="#8B008B"/>
    <circle cx="20" cy="14" r="3.5" fill="#8B008B"/>
    <circle cx="14" cy="22" r="3" fill="#8B008B"/>
    <circle cx="18" cy="22" r="3" fill="#8B008B"/>
    <path d="M16 10 L16 6 L14 8 L18 8 Z" fill="#228B22"/>
  </svg>
);

const ProsciuttoIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <ellipse cx="16" cy="16" rx="11" ry="9" fill="#CD5C5C" stroke="#8B3A3A" strokeWidth="2"/>
    <path d="M10 14 Q16 12 22 14" stroke="#FFF" strokeWidth="1" opacity="0.6"/>
    <path d="M10 18 Q16 16 22 18" stroke="#FFF" strokeWidth="1" opacity="0.6"/>
  </svg>
);

const LettuceIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <path d="M16 8 L22 14 L20 22 L12 22 L10 14 Z" fill="#90EE90" stroke="#228B22" strokeWidth="2"/>
    <path d="M14 14 L18 14 M13 18 L19 18" stroke="#228B22" strokeWidth="1" opacity="0.6"/>
  </svg>
);

export default function FortuneWheel({ spinTokens, onSpin }: FortuneWheelProps) {
  const [isSpinning, setIsSpinning] = useState(false);
  const [wonPrize, setWonPrize] = useState<Prize | null>(null);
  const [rotation, setRotation] = useState(0);
  const wheelRef = useRef<HTMLDivElement>(null);
  const pendingPrizeRef = useRef<Prize | null>(null);

  // 8 segmenti con icone SVG e colori italiani
  // Distribuiti secondo probabilità: 5% (50%), 10% (15%), 15% (7%), Prodotto (28%)
  const segments = [
    { label: '5%', type: 'bonus_5', Icon: CheeseIcon, color: '#FFD700' },      // 0: 5% - Formaggio
    { label: 'Продукт', type: 'product', Icon: TomatoIcon, color: '#FF6B6B' },  // 1: Prodotto - Pomodoro
    { label: '5%', type: 'bonus_5', Icon: SalamiIcon, color: '#D4AF37' },      // 2: 5% - Salame
    { label: '10%', type: 'bonus_10', Icon: GrapesIcon, color: '#9B59B6' },    // 3: 10% - Uva
    { label: '5%', type: 'bonus_5', Icon: CheeseIcon, color: '#FFA500' },      // 4: 5% - Formaggio
    { label: 'Продукт', type: 'product', Icon: LettuceIcon, color: '#27AE60' },// 5: Prodotto - Verdura
    { label: '5%', type: 'bonus_5', Icon: ProsciuttoIcon, color: '#C85A54' },  // 6: 5% - Prosciutto
    { label: '15%', type: 'bonus_15', Icon: GrapesIcon, color: '#8E44AD' },    // 7: 15% - Uva
  ];

  const segmentAngle = 360 / segments.length; // 45 gradi per segmento

  // Gestisce la fine dell'animazione CSS
  useEffect(() => {
    const wheel = wheelRef.current;
    if (!wheel) return;

    const handleTransitionEnd = (e: TransitionEvent) => {
      // Verifica che sia la transizione della transform della ruota
      if (e.propertyName === 'transform' && pendingPrizeRef.current) {
        // Aspetta 600ms dopo la fine dell'animazione prima di mostrare il premio
        setTimeout(() => {
          setWonPrize(pendingPrizeRef.current);
          setIsSpinning(false);
          pendingPrizeRef.current = null;
        }, 600);
      }
    };

    wheel.addEventListener('transitionend', handleTransitionEnd);
    return () => wheel.removeEventListener('transitionend', handleTransitionEnd);
  }, []);

  const handleSpin = async () => {
    if (spinTokens <= 0 || isSpinning) return;

    setIsSpinning(true);
    setWonPrize(null);

    try {
      const prize = await onSpin();
      
      // Mappa il premio a un indice di segmento
      let targetSegmentIndex = 0;
      
      if (prize.type === 'bonus' && prize.percentage) {
        // Trova un segmento che corrisponde al bonus vinto
        const matchingSegments = segments
          .map((seg, idx) => ({ seg, idx }))
          .filter(({ seg }) => seg.type === `bonus_${prize.percentage}`);
        
        // Sceglie casualmente tra i segmenti corrispondenti
        if (matchingSegments.length > 0) {
          const randomMatch = matchingSegments[Math.floor(Math.random() * matchingSegments.length)];
          targetSegmentIndex = randomMatch.idx;
        }
      } else if (prize.type === 'product') {
        // Trova un segmento prodotto
        const productSegments = segments
          .map((seg, idx) => ({ seg, idx }))
          .filter(({ seg }) => seg.type === 'product');
        
        if (productSegments.length > 0) {
          const randomMatch = productSegments[Math.floor(Math.random() * productSegments.length)];
          targetSegmentIndex = randomMatch.idx;
        }
      }
      
      // Calcola l'angolo target:
      // - L'indicatore è a 0° (top)
      // - Ogni segmento inizia a (index * segmentAngle)
      // - Vogliamo che il CENTRO del segmento sia sotto l'indicatore
      const targetAngle = targetSegmentIndex * segmentAngle + (segmentAngle / 2);
      
      // Giri completi + angolo target (normalizzato per rotazione in senso orario)
      const spinsCount = 5 + Math.random() * 3; // 5-8 giri
      const finalRotation = rotation + (360 * spinsCount) + (360 - targetAngle);
      
      // Salva il premio nel ref per mostrarlo dopo l'animazione
      pendingPrizeRef.current = prize;
      
      setRotation(finalRotation);
    } catch (error) {
      console.error('Spin failed:', error);
      setIsSpinning(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="section-fortune-wheel">
      <Card className="p-8">
        <div className="flex flex-col items-center space-y-6">
          {/* Contenitore ruota con indicatore */}
          <div className="relative w-80 h-80 flex items-center justify-center">
            {/* Indicatore centrale fisso - Fetta di formaggio */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center">
              <svg width="48" height="60" viewBox="0 0 48 60" className="drop-shadow-lg">
                {/* Fetta di formaggio con buchi */}
                <defs>
                  <linearGradient id="cheeseGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#FFE066" />
                    <stop offset="100%" stopColor="#FFD700" />
                  </linearGradient>
                </defs>
                <path 
                  d="M 24 5 L 38 55 L 10 55 Z" 
                  fill="url(#cheeseGradient)" 
                  stroke="#D4A017" 
                  strokeWidth="2"
                />
                {/* Buchi del formaggio */}
                <circle cx="24" cy="25" r="3" fill="#FFA500" opacity="0.6" />
                <circle cx="20" cy="38" r="4" fill="#FFA500" opacity="0.6" />
                <circle cx="28" cy="40" r="3.5" fill="#FFA500" opacity="0.6" />
              </svg>
            </div>

            {/* Ruota rotante */}
            <div 
              ref={wheelRef}
              className="relative w-72 h-72 rounded-full shadow-2xl"
              style={{
                transform: `rotate(${rotation}deg)`,
                transition: isSpinning ? 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)' : 'none',
              }}
            >
              {/* Bordo esterno decorativo */}
              <div className="absolute inset-0 rounded-full border-8 border-amber-900 shadow-inner" />
              
              {/* Segmenti */}
              <svg className="w-full h-full" viewBox="0 0 200 200">
                <g transform="translate(100, 100)">
                  {segments.map((segment, index) => {
                    const startAngle = (index * segmentAngle - 90) * (Math.PI / 180);
                    const endAngle = ((index + 1) * segmentAngle - 90) * (Math.PI / 180);
                    const largeArcFlag = segmentAngle > 180 ? 1 : 0;
                    
                    const x1 = 95 * Math.cos(startAngle);
                    const y1 = 95 * Math.sin(startAngle);
                    const x2 = 95 * Math.cos(endAngle);
                    const y2 = 95 * Math.sin(endAngle);

                    const pathData = `M 0 0 L ${x1} ${y1} A 95 95 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;

                    // Posizione icona e testo
                    const midAngle = (startAngle + endAngle) / 2;
                    const iconX = 60 * Math.cos(midAngle);
                    const iconY = 60 * Math.sin(midAngle);
                    const textX = 70 * Math.cos(midAngle);
                    const textY = 70 * Math.sin(midAngle) + 18;

                    return (
                      <g key={index}>
                        <path
                          d={pathData}
                          fill={segment.color}
                          stroke="#fff"
                          strokeWidth="2"
                        />
                        <foreignObject
                          x={iconX - 16}
                          y={iconY - 16}
                          width="32"
                          height="32"
                          transform={`rotate(${index * segmentAngle}, ${iconX}, ${iconY})`}
                        >
                          <div className="flex items-center justify-center w-full h-full">
                            <segment.Icon />
                          </div>
                        </foreignObject>
                        <text
                          x={textX}
                          y={textY}
                          fontSize="11"
                          fontWeight="bold"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#fff"
                          stroke="#000"
                          strokeWidth="0.5"
                          transform={`rotate(${index * segmentAngle}, ${textX}, ${textY})`}
                        >
                          {segment.label}
                        </text>
                      </g>
                    );
                  })}
                </g>
                {/* Centro decorativo */}
                <circle cx="100" cy="100" r="20" fill="#8B4513" stroke="#fff" strokeWidth="3" />
                <circle cx="100" cy="100" r="12" fill="#D4A017" />
              </svg>
            </div>
          </div>

          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <p className="text-lg font-semibold" data-testid="text-tokens">
                У вас {spinTokens} {spinTokens === 1 ? 'попытка' : spinTokens < 5 ? 'попытки' : 'попыток'}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Крутите колесо и выигрывайте бонусы!
            </p>
          </div>

          <Button
            size="lg"
            className="w-full"
            onClick={handleSpin}
            disabled={spinTokens <= 0 || isSpinning}
            data-testid="button-spin"
          >
            {isSpinning ? 'Вращается...' : 'Крутить колесо'}
          </Button>
        </div>
      </Card>

      {wonPrize && (
        <Card className="p-6 bg-primary/5 border-primary" data-testid="card-prize-won">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold mb-1">Поздравляем!</h4>
              {wonPrize.type === 'bonus' ? (
                <>
                  <p className="text-sm text-muted-foreground mb-2">
                    Вы выиграли бонус {wonPrize.percentage}% на следующий заказ!
                  </p>
                  <p className="text-lg font-bold text-primary">
                    +{Math.round(parseFloat(wonPrize.amount || '0'))} ₽
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Бонус будет автоматически применен к следующему заказу
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-2">
                    {wonPrize.name}
                  </p>
                  <Badge variant="secondary" data-testid="badge-prize-type">
                    Образец продукта
                  </Badge>
                </>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

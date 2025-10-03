import { useState } from 'react';
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

export default function FortuneWheel({ spinTokens, onSpin }: FortuneWheelProps) {
  const [isSpinning, setIsSpinning] = useState(false);
  const [wonPrize, setWonPrize] = useState<Prize | null>(null);
  const [rotation, setRotation] = useState(0);

  // 8 segmenti con icone e colori italiani
  const segments = [
    { label: '5%', icon: '🧀', color: '#FFD700', weight: 4 }, // Formaggio - 4/8 = 50%
    { label: 'Продукт', icon: '🍅', color: '#FF6B6B', weight: 2 }, // Pomodoro - 2/8 = 25%
    { label: '5%', icon: '🥓', color: '#D4AF37', weight: 4 }, // Salame
    { label: '10%', icon: '🍇', color: '#9B59B6', weight: 1.2 }, // Uva - 1.2/8 = 15%
    { label: '5%', icon: '🧀', color: '#FFA500', weight: 4 }, // Formaggio
    { label: 'Продукт', icon: '🥬', color: '#27AE60', weight: 2.24 }, // Verdura - 2.24/8 = 28%
    { label: '5%', icon: '🍖', color: '#C85A54', weight: 4 }, // Prosciutto
    { label: '15%', icon: '🍇', color: '#8E44AD', weight: 0.56 }, // Uva - 0.56/8 = 7%
  ];

  const segmentAngle = 360 / segments.length;

  const handleSpin = async () => {
    if (spinTokens <= 0 || isSpinning) return;

    setIsSpinning(true);
    setWonPrize(null);

    try {
      const prize = await onSpin();
      
      // Calcola rotazione finale (5-8 giri completi + angolo del premio)
      const spinsCount = 5 + Math.random() * 3;
      const finalRotation = rotation + (360 * spinsCount) + Math.random() * 360;
      
      setRotation(finalRotation);

      setTimeout(() => {
        setWonPrize(prize);
        setIsSpinning(false);
      }, 4000);
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

                    // Posizione testo e icona
                    const midAngle = (startAngle + endAngle) / 2;
                    const textX = 65 * Math.cos(midAngle);
                    const textY = 65 * Math.sin(midAngle);

                    return (
                      <g key={index}>
                        <path
                          d={pathData}
                          fill={segment.color}
                          stroke="#fff"
                          strokeWidth="2"
                        />
                        <text
                          x={textX}
                          y={textY}
                          fontSize="28"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          transform={`rotate(${index * segmentAngle}, ${textX}, ${textY})`}
                        >
                          {segment.icon}
                        </text>
                        <text
                          x={textX}
                          y={textY + 18}
                          fontSize="11"
                          fontWeight="bold"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#fff"
                          stroke="#000"
                          strokeWidth="0.5"
                          transform={`rotate(${index * segmentAngle}, ${textX}, ${textY + 18})`}
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
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-2xl">
              🎉
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

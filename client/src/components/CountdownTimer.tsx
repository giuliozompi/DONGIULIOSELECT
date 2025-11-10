import { useState, useEffect } from 'react';
import { AlertCircle, Clock } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface CountdownTimerProps {
  expiresAt: Date | string;
  discountCode: string;
  discountPercent: number;
  labels?: {
    title?: string;
    codeLabel?: string;
    expiresLabel?: string;
    expiredTitle?: string;
    expiredMessage?: string;
    hourLabel?: string;
    hoursLabel?: string;
    minuteLabel?: string;
    minutesLabel?: string;
    secondLabel?: string;
    secondsLabel?: string;
  };
}

export default function CountdownTimer({ 
  expiresAt, 
  discountCode, 
  discountPercent,
  labels = {}
}: CountdownTimerProps) {
  const {
    title = `Специальная скидка ${discountPercent}%!`,
    codeLabel = 'Используйте код:',
    expiresLabel = 'Истекает через:',
    expiredTitle = 'Предложение истекло',
    expiredMessage = 'Код скидки больше не действителен',
    hourLabel = 'час',
    hoursLabel = 'часов',
    minuteLabel = 'минута',
    minutesLabel = 'минут',
    secondLabel = 'секунда',
    secondsLabel = 'секунд',
  } = labels;
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const expiryDate = new Date(expiresAt);
    
    setIsExpired(false);
    setTimeRemaining('');
    
    const calculateTimeRemaining = () => {
      const now = new Date();
      const diff = expiryDate.getTime() - now.getTime();

      if (diff <= 0) {
        setIsExpired(true);
        setTimeRemaining('истёк');
        return;
      }
      
      setIsExpired(false);

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      // Russian pluralization
      const getHourWord = (n: number) => {
        if (n % 10 === 1 && n % 100 !== 11) return hourLabel;
        if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'часа';
        return hoursLabel;
      };
      
      const getMinuteWord = (n: number) => {
        if (n % 10 === 1 && n % 100 !== 11) return minuteLabel;
        if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'минуты';
        return minutesLabel;
      };
      
      const getSecondWord = (n: number) => {
        if (n % 10 === 1 && n % 100 !== 11) return secondLabel;
        if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'секунды';
        return secondsLabel;
      };

      if (hours > 0) {
        setTimeRemaining(`${hours} ${getHourWord(hours)}, ${minutes} ${getMinuteWord(minutes)} и ${seconds} ${getSecondWord(seconds)}`);
      } else if (minutes > 0) {
        setTimeRemaining(`${minutes} ${getMinuteWord(minutes)} и ${seconds} ${getSecondWord(seconds)}`);
      } else {
        setTimeRemaining(`${seconds} ${getSecondWord(seconds)}`);
      }
    };

    calculateTimeRemaining();
    const interval = setInterval(calculateTimeRemaining, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, discountCode, discountPercent, hourLabel, hoursLabel, minuteLabel, minutesLabel, secondLabel, secondsLabel]);

  if (isExpired) {
    return (
      <Card className="p-4 bg-destructive/10 border-destructive" data-testid="countdown-timer-expired">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-destructive">
              {expiredTitle}
            </p>
            <p className="text-xs text-muted-foreground">
              {expiredMessage}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 bg-primary/10 border-primary" data-testid="countdown-timer-active">
      <div className="flex items-start gap-3">
        <Clock className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
        <div className="flex-1 space-y-2">
          <div>
            <p className="text-sm font-semibold text-primary">
              {title}
            </p>
            <p className="text-xs text-muted-foreground">
              {codeLabel} <span className="font-mono font-semibold text-foreground">{discountCode}</span>
            </p>
          </div>
          <div className="bg-background/50 rounded-md p-2 border border-primary/20">
            <p className="text-xs text-muted-foreground">{expiresLabel}</p>
            <p className="text-sm font-semibold text-foreground" data-testid="countdown-time">
              {timeRemaining}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

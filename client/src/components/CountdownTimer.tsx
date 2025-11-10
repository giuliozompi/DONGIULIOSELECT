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
    title = `Sconto speciale del ${discountPercent}%!`,
    codeLabel = 'Usa il codice:',
    expiresLabel = 'Scade tra:',
    expiredTitle = 'Offerta scaduta',
    expiredMessage = 'Il codice sconto non è più valido',
    hourLabel = 'ora',
    hoursLabel = 'ore',
    minuteLabel = 'minuto',
    minutesLabel = 'minuti',
    secondLabel = 'secondo',
    secondsLabel = 'secondi',
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
        setTimeRemaining('scaduto');
        return;
      }
      
      setIsExpired(false);

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (hours > 0) {
        setTimeRemaining(`${hours} ${hours === 1 ? hourLabel : hoursLabel}, ${minutes} ${minutes === 1 ? minuteLabel : minutesLabel} e ${seconds} ${seconds === 1 ? secondLabel : secondsLabel}`);
      } else if (minutes > 0) {
        setTimeRemaining(`${minutes} ${minutes === 1 ? minuteLabel : minutesLabel} e ${seconds} ${seconds === 1 ? secondLabel : secondsLabel}`);
      } else {
        setTimeRemaining(`${seconds} ${seconds === 1 ? secondLabel : secondsLabel}`);
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

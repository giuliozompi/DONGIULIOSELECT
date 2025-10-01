import { useLocation } from 'wouter';
import { useTelegramBackButton } from '@/hooks/useTelegramBackButton';
import AIAssistant from '@/components/AIAssistant';

export default function AssistantPage() {
  const [, setLocation] = useLocation();

  useTelegramBackButton(() => setLocation('/'), true);

  //todo: remove mock functionality and connect to OpenRouter API
  const handleSendMessage = async (message: string) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    if (message.toLowerCase().includes('моцарелл')) {
      return 'Моцарелла - прекрасный выбор! Рекомендую нашу буйволиную моцареллу. Она идеально сочетается с томатами и базиликом в салате Капрезе.';
    }
    
    if (message.toLowerCase().includes('пармезан')) {
      return 'Пармезан Реджано - король итальянских сыров! Выдержанный 24 месяца, он добавит глубину вкуса любому блюду. Попробуйте его с виноградом или медом.';
    }

    return `Спасибо за ваш вопрос о "${message}". Наши эксперты рекомендуют попробовать наши сыры из коровьего молока - они отлично подходят для повседневного употребления!`;
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <div className="sticky top-0 z-50 bg-background border-b p-4 flex-shrink-0">
        <h1 className="text-2xl font-bold" data-testid="text-title">
          AI-Ассистент
        </h1>
      </div>

      <div className="flex-1 overflow-hidden">
        <AIAssistant onSendMessage={handleSendMessage} />
      </div>
    </div>
  );
}

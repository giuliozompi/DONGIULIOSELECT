import AIAssistant from '../AIAssistant';

export default function AIAssistantExample() {
  const mockSendMessage = async (message: string) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return `Спасибо за ваш вопрос: "${message}". Я рекомендую попробовать наш сыр Моцарелла - он отлично сочетается с томатами и базиликом!`;
  };

  return (
    <div className="h-[600px] border rounded-lg">
      <AIAssistant onSendMessage={mockSendMessage} />
    </div>
  );
}

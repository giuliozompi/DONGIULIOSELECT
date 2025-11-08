import { useState, useEffect, useRef } from 'react';
import { nanoid } from 'nanoid';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTelegramBackButton } from '@/hooks/useTelegramBackButton';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { getSearchVariants } from '@/lib/keyboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Bot, User, Send } from 'lucide-react';
import type { Message } from '@shared/schema';

export default function AssistantPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messagesData } = useQuery<{ conversationId: string; messages: Message[] }>({
    queryKey: conversationId ? [`/api/assistant/messages?conversationId=${conversationId}`] : ['/api/assistant/messages'],
    enabled: true,
  });

  useEffect(() => {
    if (messagesData) {
      setLocalMessages(messagesData.messages);
      if (messagesData.conversationId && !conversationId) {
        setConversationId(messagesData.conversationId);
      }
    }
  }, [messagesData]);

  const messages = localMessages;

  const sendMessageMutation = useMutation({
    mutationFn: async ({ tempId, content }: { tempId: string; content: string }) => {
      const res = await apiRequest('POST', '/api/assistant/messages', {
        conversationId: conversationId || undefined,
        content,
      });
      return { tempId, data: await res.json() };
    },
    onMutate: async ({ tempId, content }) => {
      const userMessage: Message = {
        id: tempId,
        conversationId: conversationId || '',
        role: 'user',
        content,
        createdAt: new Date(),
      };
      setLocalMessages(prev => [...prev, userMessage]);
    },
    onSuccess: ({ tempId, data }) => {
      if (!conversationId) {
        setConversationId(data.conversationId);
      }
      const newMessages = [data.userMessage, data.assistantMessage].filter(Boolean);
      setLocalMessages(prev => prev.filter(m => m.id !== tempId).concat(newMessages));
      queryClient.invalidateQueries({ queryKey: ['/api/assistant/messages'] });
    },
    onError: (error: Error, { tempId }) => {
      setLocalMessages(prev => prev.filter(m => m.id !== tempId));
      toast({
        title: 'Ошибка',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  useTelegramBackButton(() => setLocation('/'), true);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || sendMessageMutation.isPending) return;
    
    // Send original input to AI - it will detect and respond in the same language
    const tempId = `temp-${nanoid()}`;
    setInput('');
    sendMessageMutation.mutate({ tempId, content: input });
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <div className="sticky top-0 z-50 bg-background border-b p-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Button 
            size="icon" 
            variant="ghost"
            onClick={() => setLocation('/')}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold" data-testid="text-title">
            AI-Ассистент
          </h1>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {messages.length === 0 && (
          <div className="p-3 border-b">
            <div className="flex gap-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Bot className="w-5 h-5 text-primary" />
              </div>
              <Card className="p-2.5 bg-muted max-w-[85%]">
                <p className="text-xs leading-relaxed">
                  Здравствуйте! Я эксперт по итальянским деликатесам:<br/>
                  • <strong>Сомелье по сырам</strong> - подбор и выдержка<br/>
                  • <strong>Эксперт по мясу</strong> - прошутто и салями<br/>
                  • <strong>Винный сомелье</strong> - идеальные сочетания<br/>
                  • <strong>Специалист по продуктам</strong> - всё об Италии
                </p>
              </Card>
            </div>
          </div>
        )}

        <div className="p-3 border-b bg-background">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Напишите ваш вопрос..."
              disabled={sendMessageMutation.isPending}
              data-testid="input-message"
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || sendMessageMutation.isPending}
              data-testid="button-send"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <ScrollArea ref={scrollRef} className="flex-1 p-3">
          <div className="space-y-3">
            {messages.filter(Boolean).map((message) => (
              <div
                key={message.id}
                className={`flex gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                data-testid={`message-${message.role}`}
              >
                {message.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-5 h-5 text-primary" />
                  </div>
                )}
                <Card
                  className={`p-2.5 max-w-[80%] ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </Card>
                {message.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5" />
                  </div>
                )}
              </div>
            ))}

            {sendMessageMutation.isPending && (
              <div className="flex gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-5 h-5 text-primary animate-pulse" />
                </div>
                <Card className="p-2.5 bg-muted">
                  <p className="text-sm text-muted-foreground">Печатает...</p>
                </Card>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

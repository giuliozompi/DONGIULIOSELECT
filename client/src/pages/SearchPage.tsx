import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ChevronLeft, Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import ProductCard from '@/components/ProductCard';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { Product, Message } from '@shared/schema';

export default function SearchPage() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['/api/products'],
  });

  const { data: messagesData } = useQuery<{ conversationId: string; messages: Message[] }>({
    queryKey: conversationId ? ['/api/assistant/messages', `conversationId=${conversationId}`] : ['/api/assistant/messages'],
    enabled: !!conversationId,
  });

  const messages = messagesData?.messages || [];

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest('POST', '/api/assistant/messages', {
        conversationId: conversationId || undefined,
        content,
      });
      return await res.json();
    },
    onSuccess: (data) => {
      if (!conversationId) {
        setConversationId(data.conversationId);
      }
      queryClient.invalidateQueries({ queryKey: ['/api/assistant/messages'] });
    },
  });

  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);

  useEffect(() => {
    if (!query.trim()) {
      setFilteredProducts([]);
      return;
    }

    const searchLower = query.toLowerCase();
    const filtered = products.filter(p =>
      p.name.toLowerCase().includes(searchLower) ||
      p.descriptionShort?.toLowerCase().includes(searchLower) ||
      p.descriptionFull?.toLowerCase().includes(searchLower)
    );
    setFilteredProducts(filtered);
  }, [query, products]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!query.trim()) return;
    sendMessageMutation.mutate(query);
  };

  const aiSuggestions = messages
    .filter(m => m.role === 'assistant')
    .slice(-1)[0]?.content || '';

  return (
    <div className="h-screen flex flex-col bg-background">
      <div className="sticky top-0 z-50 bg-background border-b">
        <div className="p-4 flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation('/')}
            data-testid="button-back"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">Поиск продуктов</h1>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="p-4">
          <div className="relative">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Введите название продукта..."
              className="pr-20"
              data-testid="input-search-query"
            />
            <Button
              size="sm"
              onClick={handleSend}
              disabled={!query.trim() || sendMessageMutation.isPending}
              className="absolute right-1 top-1/2 -translate-y-1/2"
              data-testid="button-search"
            >
              {sendMessageMutation.isPending ? (
                <Sparkles className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {messages.length > 0 && (
          <div className="border-t bg-muted/30 p-4">
            <div className="flex items-start gap-2">
              <Sparkles className="h-5 w-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium mb-1">Ассистент говорит:</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {aiSuggestions}
                </p>
              </div>
            </div>
          </div>
        )}

        <ScrollArea ref={scrollRef} className="flex-1 p-4">
          {filteredProducts.length > 0 ? (
            <>
              <h2 className="text-lg font-semibold mb-4">
                Найдено продуктов: {filteredProducts.length}
              </h2>
              <div className="grid grid-cols-2 gap-4">
                {filteredProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    id={product.id}
                    name={product.name}
                    category=""
                    price={parseFloat(product.price)}
                    priceOld={product.priceOld ? parseFloat(product.priceOld) : undefined}
                    unit={product.unit}
                    image={product.images[0] || 'https://images.unsplash.com/photo-1452195100486-9cc805987862?w=400&h=400&fit=crop'}
                    onClick={() => setLocation(`/product/${product.id}`)}
                  />
                ))}
              </div>
            </>
          ) : query.trim() ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>Продукты не найдены</p>
              <p className="text-sm mt-2">Попробуйте использовать AI-ассистента для помощи</p>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Sparkles className="h-12 w-12 mx-auto mb-4 text-primary" />
              <p className="font-medium mb-2">Умный поиск с AI-ассистентом</p>
              <p className="text-sm">Введите название продукта, и AI поможет вам найти то, что нужно</p>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}

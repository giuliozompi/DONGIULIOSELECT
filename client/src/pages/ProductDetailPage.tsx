import { useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { useTelegramBackButton } from '@/hooks/useTelegramBackButton';
import { useTelegramMainButton } from '@/hooks/useTelegramMainButton';
import { hapticFeedback } from '@/lib/telegram';
import ProductGallery from '@/components/ProductGallery';
import TasteRating from '@/components/TasteRating';
import ProductAccordion from '@/components/ProductAccordion';
import RelatedProducts from '@/components/RelatedProducts';
import { Badge } from '@/components/ui/badge';

//todo: remove mock functionality
const mockProduct = {
  id: '1',
  name: 'Сыр Моцарелла',
  category: 'Сыры / Рассольные',
  price: 890,
  priceOld: 1200,
  unit: 'кг',
  images: [
    'https://images.unsplash.com/photo-1589881133595-39464f7aa2e4?w=800&h=800&fit=crop',
    'https://images.unsplash.com/photo-1452195100486-9cc805987862?w=800&h=800&fit=crop',
    'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=800&h=800&fit=crop',
  ],
  tasteVariations: ['Классический', 'С травами', 'С перцем'],
  tasteRatingStats: { tasty: 15, very_tasty: 25, super: 60 },
  descriptionShort: 'Настоящая итальянская моцарелла из буйволиного молока',
  descriptionFull:
    'Настоящая итальянская моцарелла из буйволиного молока. Нежная текстура и сливочный вкус делают её идеальной для салата Капрезе. Производится традиционным методом в регионе Кампания.',
  nutrition: {
    bju: { proteins: 22, fats: 16, carbs: 3, calories: 280 },
    values: ['Кальций', 'Витамин B12', 'Фосфор'],
    composition: 'Молоко буйволиное пастеризованное, закваска молочнокислых культур, соль, сычужный фермент',
  },
  consumptionTips:
    'Идеально сочетается с помидорами, базиликом и оливковым маслом первого отжима. Отлично подходит для пиццы Маргарита, салатов и закусок.',
};

//todo: remove mock functionality
const relatedProducts = [
  {
    id: '2',
    name: 'Пармезан Реджано',
    price: 1490,
    unit: 'кг',
    image: 'https://images.unsplash.com/photo-1452195100486-9cc805987862?w=400&h=400&fit=crop',
  },
  {
    id: '3',
    name: 'Горгонзола',
    price: 1290,
    unit: 'кг',
    image: 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=400&h=400&fit=crop',
  },
  {
    id: '4',
    name: 'Рикотта',
    price: 790,
    unit: 'кг',
    image: 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=400&h=400&fit=crop',
  },
];

export default function ProductDetailPage() {
  const [, setLocation] = useLocation();
  const params = useParams();
  const [selectedTaste, setSelectedTaste] = useState('Классический');
  const [quantity, setQuantity] = useState(1);

  useTelegramBackButton(() => setLocation('/'), true);

  useTelegramMainButton({
    text: `Добавить ${quantity} кг в корзину за ${mockProduct.price * quantity} ₽`,
    onClick: () => {
      hapticFeedback('success');
      console.log('Added to cart:', { productId: params.id, quantity });
    },
    show: true,
    enabled: true,
  });

  return (
    <div className="min-h-screen bg-background pb-20">
      <ProductGallery images={mockProduct.images} />

      <div className="p-6 space-y-6">
        <div>
          <p className="text-sm text-muted-foreground mb-2" data-testid="text-category">
            {mockProduct.category}
          </p>
          <h1 className="text-2xl font-bold mb-4" data-testid="text-name">
            {mockProduct.name}
          </h1>

          <div className="flex items-baseline gap-3 mb-4">
            <p className="text-3xl font-bold text-primary" data-testid="text-price">
              {mockProduct.price} ₽
            </p>
            {mockProduct.priceOld && (
              <p className="text-xl text-muted-foreground line-through" data-testid="text-price-old">
                {mockProduct.priceOld} ₽
              </p>
            )}
            <p className="text-lg text-muted-foreground">/ {mockProduct.unit}</p>
          </div>

          {mockProduct.tasteVariations && (
            <div className="space-y-2 mb-4">
              <p className="text-sm font-medium">Выберите вкус:</p>
              <div className="flex gap-2 flex-wrap">
                {mockProduct.tasteVariations.map((taste) => (
                  <Badge
                    key={taste}
                    variant={selectedTaste === taste ? 'default' : 'outline'}
                    className="cursor-pointer hover-elevate active-elevate-2 px-4 py-2"
                    onClick={() => {
                      hapticFeedback('light');
                      setSelectedTaste(taste);
                    }}
                    data-testid={`button-taste-${taste}`}
                  >
                    {taste}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <p className="text-base leading-relaxed text-foreground mb-4">
            {mockProduct.descriptionShort}
          </p>
        </div>

        <TasteRating
          stats={mockProduct.tasteRatingStats}
          onRate={(rating) => console.log('Rated:', rating)}
        />

        <ProductAccordion
          fullDescription={mockProduct.descriptionFull}
          nutrition={mockProduct.nutrition}
          consumptionTips={mockProduct.consumptionTips}
        />

        <RelatedProducts
          title="Похожие продукты"
          products={relatedProducts}
          onProductClick={(id) => setLocation(`/product/${id}`)}
        />
      </div>
    </div>
  );
}

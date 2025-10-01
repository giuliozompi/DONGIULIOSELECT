import { useState } from 'react';
import { useLocation } from 'wouter';
import CategoryNav from '@/components/CategoryNav';
import ProductCard from '@/components/ProductCard';
import logoImage from '@assets/dgselect_tiffany_print_ready_Страница_1_Изображение_0001_1759313793382.jpg';

//todo: remove mock functionality
const mockCategories = [
  { id: 'cheese', name: 'Сыры', count: 24 },
  { id: 'meat', name: 'Мясные деликатесы', count: 18 },
  { id: 'grocery', name: 'Бакалея', count: 32 },
  { id: 'desserts', name: 'Десерты', count: 12 },
  { id: 'dishes', name: 'Посуда', count: 8 },
];

//todo: remove mock functionality
const mockProducts = [
  {
    id: '1',
    name: 'Сыр Моцарелла',
    category: 'Сыры / Рассольные',
    price: 890,
    priceOld: 1200,
    unit: 'кг',
    image: 'https://images.unsplash.com/photo-1589881133595-39464f7aa2e4?w=400&h=400&fit=crop',
  },
  {
    id: '2',
    name: 'Пармезан Реджано',
    category: 'Сыры / Твердые',
    price: 1490,
    unit: 'кг',
    image: 'https://images.unsplash.com/photo-1452195100486-9cc805987862?w=400&h=400&fit=crop',
  },
  {
    id: '3',
    name: 'Горгонзола',
    category: 'Сыры / Мягкие',
    price: 1290,
    unit: 'кг',
    image: 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=400&h=400&fit=crop',
  },
  {
    id: '4',
    name: 'Рикотта',
    category: 'Сыры / Мягкие',
    price: 790,
    unit: 'кг',
    image: 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=400&h=400&fit=crop',
  },
  {
    id: '5',
    name: 'Прошутто',
    category: 'Мясные деликатесы',
    price: 2490,
    priceOld: 2890,
    unit: 'кг',
    image: 'https://images.unsplash.com/photo-1542843137-8791a6904d14?w=400&h=400&fit=crop',
  },
  {
    id: '6',
    name: 'Салями',
    category: 'Мясные деликатесы',
    price: 1890,
    unit: 'кг',
    image: 'https://images.unsplash.com/photo-1599909575473-4f4e29ab8e81?w=400&h=400&fit=crop',
  },
];

export default function HomePage() {
  const [, setLocation] = useLocation();
  const [activeCategory, setActiveCategory] = useState('cheese');

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-50 bg-background border-b">
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-center">
            <img 
              src={logoImage} 
              alt="Don Giulio Select" 
              className="h-16 w-auto"
              style={{ mixBlendMode: 'multiply' }}
              data-testid="img-logo"
            />
          </div>
          <CategoryNav
            categories={mockCategories}
            activeId={activeCategory}
            onCategorySelect={setActiveCategory}
          />
        </div>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-2 gap-4">
          {mockProducts.map((product) => (
            <ProductCard
              key={product.id}
              {...product}
              onClick={() => setLocation(`/product/${product.id}`)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

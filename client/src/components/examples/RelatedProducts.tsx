import RelatedProducts from '../RelatedProducts';

export default function RelatedProductsExample() {
  const products = [
    {
      id: '1',
      name: 'Пармезан',
      price: 1490,
      unit: 'кг',
      image: 'https://images.unsplash.com/photo-1452195100486-9cc805987862?w=400&h=400&fit=crop',
    },
    {
      id: '2',
      name: 'Горгонзола',
      price: 1290,
      unit: 'кг',
      image: 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=400&h=400&fit=crop',
    },
    {
      id: '3',
      name: 'Рикотта',
      price: 790,
      unit: 'кг',
      image: 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=400&h=400&fit=crop',
    },
  ];

  return (
    <div className="p-6">
      <RelatedProducts
        title="Похожие продукты"
        products={products}
        onProductClick={(id) => console.log('Clicked product:', id)}
      />
    </div>
  );
}

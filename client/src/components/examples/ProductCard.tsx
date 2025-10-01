import ProductCard from '../ProductCard';

export default function ProductCardExample() {
  return (
    <div className="grid grid-cols-2 gap-4 p-4">
      <ProductCard
        id="1"
        name="Сыр Моцарелла"
        category="Сыры / Рассольные"
        price={890}
        priceOld={1200}
        unit="кг"
        image="https://images.unsplash.com/photo-1589881133595-39464f7aa2e4?w=400&h=400&fit=crop"
        onClick={() => console.log('Clicked Моцарелла')}
      />
      <ProductCard
        id="2"
        name="Пармезан Реджано"
        category="Сыры / Твердые"
        price={1490}
        unit="кг"
        image="https://images.unsplash.com/photo-1452195100486-9cc805987862?w=400&h=400&fit=crop"
        onClick={() => console.log('Clicked Пармезан')}
      />
    </div>
  );
}

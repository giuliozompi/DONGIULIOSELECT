import { useState } from 'react';
import CartItem from '../CartItem';

export default function CartItemExample() {
  const [quantity, setQuantity] = useState(2);

  return (
    <div className="p-6 space-y-4">
      <CartItem
        id="1"
        name="Сыр Моцарелла"
        image="https://images.unsplash.com/photo-1589881133595-39464f7aa2e4?w=200&h=200&fit=crop"
        price={890}
        unit="кг"
        quantity={quantity}
        onQuantityChange={setQuantity}
        onRemove={() => console.log('Remove item')}
      />
    </div>
  );
}

import { useState } from 'react';
import CategoryNav from '../CategoryNav';

export default function CategoryNavExample() {
  const [activeId, setActiveId] = useState('cheese');

  const categories = [
    { id: 'cheese', name: 'Сыры', count: 24 },
    { id: 'meat', name: 'Мясные деликатесы', count: 18 },
    { id: 'grocery', name: 'Бакалея', count: 32 },
    { id: 'desserts', name: 'Десерты', count: 12 },
    { id: 'dishes', name: 'Посуда', count: 8 },
  ];

  return (
    <div className="p-6">
      <CategoryNav
        categories={categories}
        activeId={activeId}
        onCategorySelect={setActiveId}
      />
    </div>
  );
}

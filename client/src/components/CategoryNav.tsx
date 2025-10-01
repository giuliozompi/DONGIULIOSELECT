import { Badge } from '@/components/ui/badge';

interface Category {
  id: string;
  name: string;
  count?: number;
}

interface CategoryNavProps {
  categories: Category[];
  activeId: string;
  onCategorySelect: (id: string) => void;
}

export default function CategoryNav({ categories, activeId, onCategorySelect }: CategoryNavProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide" data-testid="nav-categories">
      {categories.map((category) => (
        <Badge
          key={category.id}
          variant={activeId === category.id ? 'default' : 'outline'}
          className="cursor-pointer hover-elevate active-elevate-2 px-4 py-2 whitespace-nowrap flex-shrink-0"
          onClick={() => onCategorySelect(category.id)}
          data-testid={`button-category-${category.id}`}
        >
          {category.name}
          {category.count !== undefined && ` (${category.count})`}
        </Badge>
      ))}
    </div>
  );
}

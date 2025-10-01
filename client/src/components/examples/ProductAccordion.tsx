import ProductAccordion from '../ProductAccordion';

export default function ProductAccordionExample() {
  return (
    <div className="p-6">
      <ProductAccordion
        fullDescription="Настоящая итальянская моцарелла из буйволиного молока. Нежная текстура и сливочный вкус делают её идеальной для салата Капрезе."
        nutrition={{
          bju: { proteins: 22, fats: 16, carbs: 3, calories: 280 },
          values: ['Кальций', 'Витамин B12', 'Фосфор'],
          composition: 'Молоко буйволиное, закваска, соль, сычужный фермент',
        }}
        consumptionTips="Идеально сочетается с помидорами, базиликом и оливковым маслом. Отлично подходит для пиццы и салатов."
      />
    </div>
  );
}

import { db } from './db';
import { categories, products } from '@shared/schema';

export async function seedDatabase() {
  console.log('🌱 Seeding database...');

  // Check if already seeded
  const existingCategories = await db.select().from(categories).limit(1);
  if (existingCategories.length > 0) {
    console.log('✅ Database already seeded');
    return;
  }

  // Seed categories
  const categoryData = [
    { id: '1', name: 'Сыры', slug: 'cheese', image: null, parentId: null, sortOrder: 1 },
    { id: '2', name: 'Твердые сыры', slug: 'hard-cheese', image: null, parentId: '1', sortOrder: 1 },
    { id: '3', name: 'Мягкие сыры', slug: 'soft-cheese', image: null, parentId: '1', sortOrder: 2 },
    { id: '4', name: 'Колбасы', slug: 'salami', image: null, parentId: null, sortOrder: 2 },
    { id: '5', name: 'Салями', slug: 'salami-type', image: null, parentId: '4', sortOrder: 1 },
    { id: '6', name: 'Прошутто', slug: 'prosciutto', image: null, parentId: '4', sortOrder: 2 },
    { id: '7', name: 'Масла и соусы', slug: 'oils', image: null, parentId: null, sortOrder: 3 },
    { id: '8', name: 'Оливковое масло', slug: 'olive-oil', image: null, parentId: '7', sortOrder: 1 },
  ];

  await db.insert(categories).values(categoryData);
  console.log('✅ Categories seeded');

  // Seed products
  const productData = [
    {
      id: '1',
      name: 'Пармиджано Реджано 24 месяца',
      slug: 'parmigiano-reggiano-24',
      categoryId: '2',
      images: ['https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=800'],
      price: '890',
      priceOld: '1200',
      unit: 'кг',
      inStock: true,
      tasteVariations: ['Классический', 'С трюфелем', 'Выдержанный 36 мес'],
      tasteRatingStats: { tasty: 120, veryTasty: 340, superTasty: 540 },
      descriptionShort: 'Легендарный итальянский сыр с насыщенным вкусом',
      descriptionFull: 'Пармиджано Реджано - король итальянских сыров. Выдержка 24 месяца придает ему неповторимый насыщенный вкус с ореховыми нотками.',
      nutrition: {
        proteins: '33г',
        fats: '28г',
        carbs: '0г',
        calories: '392 ккал',
        composition: ['Молоко коровье', 'Соль', 'Закваска'],
        additionalInfo: ['Без лактозы', 'Натуральный продукт', 'PDO сертификация'],
      },
    },
    {
      id: '2',
      name: 'Моцарелла Буффало',
      slug: 'mozzarella-buffalo',
      categoryId: '3',
      images: ['https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=800'],
      price: '650',
      priceOld: null,
      unit: 'кг',
      inStock: true,
      tasteVariations: ['Классическая', 'Копченая'],
      tasteRatingStats: { tasty: 80, veryTasty: 220, superTasty: 300 },
      descriptionShort: 'Нежная моцарелла из молока буйволиц',
      descriptionFull: 'Настоящая моцарелла из Кампании, сделанная из молока буйволиц по традиционной рецептуре.',
      nutrition: {
        proteins: '18г',
        fats: '24г',
        carbs: '2г',
        calories: '280 ккал',
        composition: ['Молоко буйволиц', 'Закваска', 'Соль'],
        additionalInfo: ['DOP сертификация', 'Ручная работа'],
      },
    },
    {
      id: '3',
      name: 'Салями Милано',
      slug: 'salami-milano',
      categoryId: '5',
      images: ['https://images.unsplash.com/photo-1542574271-7f3b92e6c821?w=800'],
      price: '720',
      priceOld: null,
      unit: 'кг',
      inStock: true,
      tasteVariations: ['Традиционная', 'С острым перцем'],
      tasteRatingStats: { tasty: 95, veryTasty: 180, superTasty: 225 },
      descriptionShort: 'Классическая миланская салями',
      descriptionFull: 'Салями Милано - символ итальянской гастрономии. Изготовлена по традиционному рецепту из отборной свинины.',
      nutrition: {
        proteins: '22г',
        fats: '35г',
        carbs: '1г',
        calories: '407 ккал',
        composition: ['Свинина', 'Соль', 'Специи', 'Чеснок'],
        additionalInfo: ['Натуральная оболочка', 'Выдержка 60 дней'],
      },
    },
    {
      id: '4',
      name: 'Прошутто Ди Парма',
      slug: 'prosciutto-di-parma',
      categoryId: '6',
      images: ['https://images.unsplash.com/photo-1603048588665-791ca8aea617?w=800'],
      price: '980',
      priceOld: '1100',
      unit: 'кг',
      inStock: true,
      tasteVariations: ['18 месяцев', '24 месяца'],
      tasteRatingStats: { tasty: 70, veryTasty: 190, superTasty: 340 },
      descriptionShort: 'Изысканная вяленая ветчина из Пармы',
      descriptionFull: 'Прошутто Ди Парма - эталон итальянской ветчины. Тает во рту, оставляя послевкусие сладости и ореха.',
      nutrition: {
        proteins: '27г',
        fats: '12г',
        carbs: '0г',
        calories: '224 ккал',
        composition: ['Свинина', 'Морская соль'],
        additionalInfo: ['DOP сертификация', 'Только морская соль'],
      },
    },
  ];

  await db.insert(products).values(productData);
  console.log('✅ Products seeded');
  console.log('🎉 Database seeding complete!');
}

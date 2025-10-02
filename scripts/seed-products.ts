/**
 * Script per popolare il database con prodotti di esempio
 * Esegui con: npx tsx scripts/seed-products.ts
 */

import { db } from '../server/db';
import { categories, products } from '../shared/schema';

async function seedDatabase() {
  console.log('🌱 Inizio seeding database...');

  try {
    // 1. Crea categorie
    console.log('📁 Creazione categorie...');
    
    const cheeseCategory = await db.insert(categories).values({
      name: 'Сыры',
      slug: 'syry',
      sortOrder: 1,
    }).returning();

    const meatCategory = await db.insert(categories).values({
      name: 'Мясные деликатесы',
      slug: 'myasnye-delikatesy',
      sortOrder: 2,
    }).returning();

    const groceryCategory = await db.insert(categories).values({
      name: 'Бакалея',
      slug: 'bakaleya',
      sortOrder: 3,
    }).returning();

    const dessertsCategory = await db.insert(categories).values({
      name: 'Десерты',
      slug: 'deserty',
      sortOrder: 4,
    }).returning();

    console.log(`✅ Создано ${4} категории`);

    // 2. Crea prodotti
    console.log('🧀 Creazione prodotti...');

    const productsToInsert = [
      // Сыры
      {
        name: 'Моцарелла Буффало',
        slug: 'mozzarella-buffalo',
        categoryId: cheeseCategory[0].id,
        images: ['https://images.unsplash.com/photo-1589881133595-39464f7aa2e4?w=800&h=800&fit=crop'],
        price: '890.00',
        priceOld: '1200.00',
        unit: 'кг',
        inStock: true,
        tasteVariations: ['Классическая', 'С травами'],
        descriptionShort: 'Нежнейший итальянский сыр из молока буйволиц',
        descriptionFull: 'Настоящая моцарелла из Кампании, изготовленная по традиционному рецепту. Мягкая, сливочная текстура идеально подходит для салатов и пиццы.',
        nutrition: {
          proteins: '18г',
          fats: '22г',
          carbs: '2г',
          calories: '280ккал',
          composition: ['Молоко буйволиц', 'Закваска', 'Соль'],
          additionalInfo: ['Без консервантов', 'Срок хранения: 7 дней'],
        },
      },
      {
        name: 'Пармиджано Реджано 24 месяца',
        slug: 'parmigiano-reggiano-24',
        categoryId: cheeseCategory[0].id,
        images: ['https://images.unsplash.com/photo-1452195100486-9cc805987862?w=800&h=800&fit=crop'],
        price: '1490.00',
        unit: 'кг',
        inStock: true,
        tasteVariations: ['24 месяца', '36 месяцев'],
        descriptionShort: 'Король итальянских сыров с насыщенным вкусом',
        descriptionFull: 'Выдержанный пармезан из региона Эмилия-Романья. Твёрдая текстура с кристалликами, богатый ореховый вкус.',
        nutrition: {
          proteins: '32г',
          fats: '28г',
          carbs: '0г',
          calories: '392ккал',
          composition: ['Молоко', 'Соль', 'Закваска'],
          additionalInfo: ['DOP сертификация', 'Выдержка 24 месяца'],
        },
      },
      {
        name: 'Горгонзола Дольче',
        slug: 'gorgonzola-dolce',
        categoryId: cheeseCategory[0].id,
        images: ['https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=800&h=800&fit=crop'],
        price: '1290.00',
        unit: 'кг',
        inStock: true,
        tasteVariations: ['Дольче', 'Пиканте'],
        descriptionShort: 'Сливочный сыр с благородной плесенью',
        descriptionFull: 'Мягкий итальянский сыр с голубой плесенью. Сладковатый вкус идеально сочетается с мёдом и орехами.',
        nutrition: {
          proteins: '19г',
          fats: '27г',
          carbs: '2г',
          calories: '328ккал',
          composition: ['Молоко', 'Penicillium', 'Соль'],
          additionalInfo: ['Выдержка 60 дней'],
        },
      },
      {
        name: 'Рикотта Фреска',
        slug: 'ricotta-fresca',
        categoryId: cheeseCategory[0].id,
        images: ['https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=800&h=800&fit=crop'],
        price: '790.00',
        unit: 'кг',
        inStock: true,
        tasteVariations: [],
        descriptionShort: 'Свежий сывороточный сыр',
        descriptionFull: 'Нежный творожный сыр, идеальный для десертов и лазаньи. Лёгкий и воздушный.',
        nutrition: {
          proteins: '11г',
          fats: '13г',
          carbs: '3г',
          calories: '174ккал',
          composition: ['Молочная сыворотка', 'Молоко', 'Соль'],
          additionalInfo: ['Свежий продукт', 'Срок хранения: 5 дней'],
        },
      },
      // Мясные деликатесы
      {
        name: 'Прошутто Ди Парма 18 месяцев',
        slug: 'prosciutto-di-parma-18',
        categoryId: meatCategory[0].id,
        images: ['https://images.unsplash.com/photo-1542843137-8791a6904d14?w=800&h=800&fit=crop'],
        price: '2490.00',
        priceOld: '2890.00',
        unit: 'кг',
        inStock: true,
        tasteVariations: ['18 месяцев', '24 месяца'],
        descriptionShort: 'Легендарная итальянская ветчина',
        descriptionFull: 'Сыровяленая свиная нога из Пармы. Нежная, тающая во рту текстура с деликатным сладковатым вкусом.',
        nutrition: {
          proteins: '25г',
          fats: '12г',
          carbs: '0г',
          calories: '212ккал',
          composition: ['Свинина', 'Морская соль'],
          additionalInfo: ['DOP сертификация', 'Без добавок'],
        },
      },
      {
        name: 'Салями Милано',
        slug: 'salami-milano',
        categoryId: meatCategory[0].id,
        images: ['https://images.unsplash.com/photo-1599909575473-4f4e29ab8e81?w=800&h=800&fit=crop'],
        price: '1890.00',
        unit: 'кг',
        inStock: true,
        tasteVariations: ['Классическая', 'С перцем'],
        descriptionShort: 'Классическая миланская салями',
        descriptionFull: 'Традиционная итальянская колбаса с выраженным ароматом чеснока и чёрного перца.',
        nutrition: {
          proteins: '22г',
          fats: '31г',
          carbs: '1г',
          calories: '378ккал',
          composition: ['Свинина', 'Говядина', 'Специи', 'Соль'],
          additionalInfo: ['Созревание 60 дней'],
        },
      },
      {
        name: 'Брезаола',
        slug: 'bresaola',
        categoryId: meatCategory[0].id,
        images: ['https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=800&h=800&fit=crop'],
        price: '3200.00',
        unit: 'кг',
        inStock: true,
        tasteVariations: [],
        descriptionShort: 'Вяленая говядина из Вальтеллины',
        descriptionFull: 'Постная вяленая говядина с насыщенным вкусом. Подаётся тонкими ломтиками с рукколой и пармезаном.',
        nutrition: {
          proteins: '33г',
          fats: '2г',
          carbs: '0г',
          calories: '151ккал',
          composition: ['Говядина', 'Морская соль', 'Специи'],
          additionalInfo: ['Выдержка 8-12 недель', 'IGP сертификация'],
        },
      },
      // Бакалея
      {
        name: 'Паста Тальятелле',
        slug: 'pasta-tagliatelle',
        categoryId: groceryCategory[0].id,
        images: ['https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=800&h=800&fit=crop'],
        price: '450.00',
        unit: 'упак (500г)',
        inStock: true,
        tasteVariations: ['Классическая', 'Со шпинатом'],
        descriptionShort: 'Свежая яичная паста ручной работы',
        descriptionFull: 'Традиционная паста из твёрдых сортов пшеницы с добавлением свежих яиц.',
        nutrition: {
          proteins: '13г',
          fats: '3г',
          carbs: '70г',
          calories: '356ккал',
          composition: ['Мука твёрдых сортов', 'Яйца', 'Вода', 'Соль'],
          additionalInfo: ['Ручная работа', 'Время варки: 3-4 минуты'],
        },
      },
      {
        name: 'Оливковое масло Extra Virgin',
        slug: 'olive-oil-extra-virgin',
        categoryId: groceryCategory[0].id,
        images: ['https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=800&h=800&fit=crop'],
        price: '1200.00',
        unit: 'бут (750мл)',
        inStock: true,
        tasteVariations: [],
        descriptionShort: 'Масло холодного отжима из Тосканы',
        descriptionFull: 'Премиальное оливковое масло первого холодного отжима с фруктовыми нотами.',
        nutrition: {
          proteins: '0г',
          fats: '100г',
          carbs: '0г',
          calories: '884ккал',
          composition: ['100% оливковое масло Extra Virgin'],
          additionalInfo: ['Урожай 2024', 'Кислотность <0.5%'],
        },
      },
      // Десерты
      {
        name: 'Тирамису',
        slug: 'tiramisu',
        categoryId: dessertsCategory[0].id,
        images: ['https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=800&h=800&fit=crop'],
        price: '890.00',
        unit: 'порция (200г)',
        inStock: true,
        tasteVariations: ['Классический', 'С амаретто'],
        descriptionShort: 'Легендарный итальянский десерт',
        descriptionFull: 'Нежные слои савоярди, пропитанные эспрессо, с кремом маскарпоне.',
        nutrition: {
          proteins: '6г',
          fats: '18г',
          carbs: '35г',
          calories: '322ккал',
          composition: ['Маскарпоне', 'Савоярди', 'Кофе', 'Яйца', 'Какао'],
          additionalInfo: ['Свежее приготовление', 'Срок хранения: 3 дня'],
        },
      },
      {
        name: 'Панна Котта',
        slug: 'panna-cotta',
        categoryId: dessertsCategory[0].id,
        images: ['https://images.unsplash.com/photo-1488477181946-6428a0291777?w=800&h=800&fit=crop'],
        price: '550.00',
        unit: 'порция (150г)',
        inStock: true,
        tasteVariations: ['С ванилью', 'С ягодами'],
        descriptionShort: 'Кремовый десерт с ягодным соусом',
        descriptionFull: 'Нежный молочный десерт с ванилью, подаётся с соусом из свежих ягод.',
        nutrition: {
          proteins: '4г',
          fats: '28г',
          carbs: '22г',
          calories: '352ккал',
          composition: ['Сливки', 'Сахар', 'Желатин', 'Ваниль', 'Ягоды'],
          additionalInfo: ['Без глютена', 'Срок хранения: 2 дня'],
        },
      },
    ];

    for (const product of productsToInsert) {
      await db.insert(products).values(product);
    }

    console.log(`✅ Создано ${productsToInsert.length} продуктов`);
    console.log('🎉 Database seeding completato con successo!');
    
  } catch (error) {
    console.error('❌ Errore durante seeding:', error);
    throw error;
  }
}

seedDatabase()
  .then(() => {
    console.log('✅ Seeding terminato');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Seeding fallito:', error);
    process.exit(1);
  });

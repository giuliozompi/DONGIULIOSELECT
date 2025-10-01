import {
  type User,
  type InsertUser,
  type Category,
  type InsertCategory,
  type Product,
  type InsertProduct,
  type Cart,
  type Order,
  type InsertOrder,
  type FortuneSpinTokens,
  type Prize,
  type InsertPrize,
  type Spin,
  type InsertSpin,
  type Conversation,
  type InsertConversation,
  type Message,
  type InsertMessage,
  type PaymentIntent,
  type InsertPaymentIntent,
} from "@shared/schema";
import { randomUUID } from "crypto";

// Helper per normalizzare input prodotto
function normalizeProductInsert(input: InsertProduct, id: string): Product {
  return {
    id,
    name: input.name,
    slug: input.slug,
    categoryId: input.categoryId,
    images: input.images ? Array.from(input.images) : [],
    price: input.price,
    priceOld: input.priceOld ?? null,
    unit: input.unit ?? 'кг',
    inStock: input.inStock ?? true,
    tasteVariations: input.tasteVariations ? Array.from(input.tasteVariations) : [],
    tasteRatingStats: input.tasteRatingStats ?? { tasty: 0, veryTasty: 0, superTasty: 0 },
    descriptionShort: input.descriptionShort ?? null,
    descriptionFull: input.descriptionFull ?? null,
    nutrition: input.nutrition ? {
      proteins: input.nutrition.proteins,
      fats: input.nutrition.fats,
      carbs: input.nutrition.carbs,
      calories: input.nutrition.calories,
      composition: Array.from<string>(input.nutrition.composition),
      additionalInfo: Array.from<string>(input.nutrition.additionalInfo),
    } : null,
  };
}

// Helper per normalizzare order items
function normalizeOrderItems(items: any): Array<{productId: string; productName: string; quantity: number; price: string; unit: string}> {
  if (!Array.isArray(items)) return [];
  return items.map((item: any) => ({
    productId: String(item.productId ?? ''),
    productName: String(item.productName ?? ''),
    quantity: Number(item.quantity ?? 0),
    price: String(item.price ?? '0'),
    unit: String(item.unit ?? 'кг'),
  }));
}

// Helper per merge update prodotto
function mergeProductUpdate(product: Product, updates: Partial<InsertProduct>): Product {
  const merged: Product = { ...product };
  
  if (updates.name !== undefined) merged.name = updates.name;
  if (updates.slug !== undefined) merged.slug = updates.slug;
  if (updates.categoryId !== undefined) merged.categoryId = updates.categoryId;
  if (updates.images !== undefined) merged.images = Array.from(updates.images);
  if (updates.price !== undefined) merged.price = updates.price;
  if (updates.priceOld !== undefined) merged.priceOld = updates.priceOld;
  if (updates.unit !== undefined) merged.unit = updates.unit;
  if (updates.inStock !== undefined) merged.inStock = updates.inStock;
  if (updates.tasteVariations !== undefined) {
    merged.tasteVariations = updates.tasteVariations ? Array.from(updates.tasteVariations) : [];
  }
  if (updates.tasteRatingStats !== undefined) {
    merged.tasteRatingStats = updates.tasteRatingStats ?? { tasty: 0, veryTasty: 0, superTasty: 0 };
  }
  if (updates.descriptionShort !== undefined) merged.descriptionShort = updates.descriptionShort;
  if (updates.descriptionFull !== undefined) merged.descriptionFull = updates.descriptionFull;
  if (updates.nutrition !== undefined) {
    merged.nutrition = updates.nutrition ? {
      proteins: updates.nutrition.proteins,
      fats: updates.nutrition.fats,
      carbs: updates.nutrition.carbs,
      calories: updates.nutrition.calories,
      composition: Array.from<string>(updates.nutrition.composition),
      additionalInfo: Array.from<string>(updates.nutrition.additionalInfo),
    } : null;
  }
  
  return merged;
}

export interface IStorage {
  // Пользователи
  getUser(id: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Категории
  getAllCategories(): Promise<Category[]>;
  getCategoryById(id: string): Promise<Category | undefined>;
  getCategoryBySlug(slug: string): Promise<Category | undefined>;
  createCategory(category: InsertCategory): Promise<Category>;

  // Продукты
  getAllProducts(filters?: { categoryId?: string; inStock?: boolean }): Promise<Product[]>;
  getProductById(id: string): Promise<Product | undefined>;
  getProductBySlug(slug: string): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: string, product: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: string): Promise<boolean>;

  // Корзина
  getCart(userId: string): Promise<Cart | undefined>;
  setCart(userId: string, items: Cart['items']): Promise<Cart>;
  clearCart(userId: string): Promise<void>;

  // Заказы
  createOrder(order: InsertOrder): Promise<Order>;
  getOrderById(id: string): Promise<Order | undefined>;
  getOrdersByUserId(userId: string): Promise<Order[]>;
  updateOrderStatus(id: string, status: string, paymentId?: string): Promise<Order | undefined>;

  // Fortune Wheel
  getSpinTokens(userId: string): Promise<FortuneSpinTokens>;
  decrementSpinTokens(userId: string): Promise<FortuneSpinTokens | undefined>;
  incrementSpinTokens(userId: string, amount: number): Promise<FortuneSpinTokens>;
  createSpin(spin: InsertSpin): Promise<Spin>;
  createPrize(prize: InsertPrize): Promise<Prize>;
  getPrizesByUserId(userId: string): Promise<Prize[]>;
  updatePrize(id: string, updates: Partial<Prize>): Promise<Prize | undefined>;

  // AI Assistant
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  getConversationById(id: string): Promise<Conversation | undefined>;
  getConversationsByUserId(userId: string): Promise<Conversation[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  getMessagesByConversationId(conversationId: string): Promise<Message[]>;

  // Платежи
  createPaymentIntent(intent: InsertPaymentIntent): Promise<PaymentIntent>;
  getPaymentIntentById(id: string): Promise<PaymentIntent | undefined>;
  getPaymentIntentByOrderId(orderId: string): Promise<PaymentIntent | undefined>;
  updatePaymentIntentStatus(id: string, status: string, raw?: any): Promise<PaymentIntent | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private categories: Map<string, Category>;
  private products: Map<string, Product>;
  private carts: Map<string, Cart>;
  private orders: Map<string, Order>;
  private spinTokens: Map<string, FortuneSpinTokens>;
  private prizes: Map<string, Prize>;
  private spins: Map<string, Spin>;
  private conversations: Map<string, Conversation>;
  private messages: Map<string, Message>;
  private paymentIntents: Map<string, PaymentIntent>;

  constructor() {
    this.users = new Map();
    this.categories = new Map();
    this.products = new Map();
    this.carts = new Map();
    this.orders = new Map();
    this.spinTokens = new Map();
    this.prizes = new Map();
    this.spins = new Map();
    this.conversations = new Map();
    this.messages = new Map();
    this.paymentIntents = new Map();
    
    this.seedInitialData();
  }

  // Инициализация начальных данных
  private seedInitialData() {
    // Создание категорий
    const categories: Category[] = [
      { id: '1', name: 'Сыры', slug: 'cheese', parentId: null, sortOrder: 1 },
      { id: '2', name: 'Твердые сыры', slug: 'hard-cheese', parentId: '1', sortOrder: 1 },
      { id: '3', name: 'Мягкие сыры', slug: 'soft-cheese', parentId: '1', sortOrder: 2 },
      { id: '4', name: 'Колбасы', slug: 'salami', parentId: null, sortOrder: 2 },
      { id: '5', name: 'Салями', slug: 'salami-type', parentId: '4', sortOrder: 1 },
      { id: '6', name: 'Прошутто', slug: 'prosciutto', parentId: '4', sortOrder: 2 },
      { id: '7', name: 'Масла и соусы', slug: 'oils', parentId: null, sortOrder: 3 },
      { id: '8', name: 'Оливковое масло', slug: 'olive-oil', parentId: '7', sortOrder: 1 },
    ];
    categories.forEach(cat => this.categories.set(cat.id, cat));

    // Создание продуктов
    const products = [
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
    ] as Product[];
    products.forEach(prod => this.products.set(prod.id, prod));
  }

  // Пользователи
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const user: User = {
      id: insertUser.id,
      username: insertUser.username ?? null,
      firstName: insertUser.firstName ?? null,
      lastName: insertUser.lastName ?? null,
    };
    this.users.set(user.id, user);
    return user;
  }

  // Категории
  async getAllCategories(): Promise<Category[]> {
    return Array.from(this.categories.values());
  }

  async getCategoryById(id: string): Promise<Category | undefined> {
    return this.categories.get(id);
  }

  async getCategoryBySlug(slug: string): Promise<Category | undefined> {
    return Array.from(this.categories.values()).find(cat => cat.slug === slug);
  }

  async createCategory(insertCategory: InsertCategory): Promise<Category> {
    const id = randomUUID();
    const category: Category = {
      id,
      name: insertCategory.name,
      slug: insertCategory.slug,
      parentId: insertCategory.parentId ?? null,
      sortOrder: insertCategory.sortOrder ?? 0,
    };
    this.categories.set(id, category);
    return category;
  }

  // Продукты
  async getAllProducts(filters?: { categoryId?: string; inStock?: boolean }): Promise<Product[]> {
    let products = Array.from(this.products.values());
    
    if (filters?.categoryId) {
      products = products.filter(p => p.categoryId === filters.categoryId);
    }
    
    if (filters?.inStock !== undefined) {
      products = products.filter(p => p.inStock === filters.inStock);
    }
    
    return products;
  }

  async getProductById(id: string): Promise<Product | undefined> {
    return this.products.get(id);
  }

  async getProductBySlug(slug: string): Promise<Product | undefined> {
    return Array.from(this.products.values()).find(p => p.slug === slug);
  }

  async createProduct(insertProduct: InsertProduct): Promise<Product> {
    const id = randomUUID();
    const product = normalizeProductInsert(insertProduct, id);
    this.products.set(id, product);
    return product;
  }

  async updateProduct(id: string, updates: Partial<InsertProduct>): Promise<Product | undefined> {
    const product = this.products.get(id);
    if (!product) return undefined;
    
    const updated = mergeProductUpdate(product, updates);
    this.products.set(id, updated);
    return updated;
  }

  async deleteProduct(id: string): Promise<boolean> {
    return this.products.delete(id);
  }

  // Корзина
  async getCart(userId: string): Promise<Cart | undefined> {
    return this.carts.get(userId);
  }

  async setCart(userId: string, items: Cart['items']): Promise<Cart> {
    const cart: Cart = {
      userId,
      items,
      updatedAt: new Date(),
    };
    this.carts.set(userId, cart);
    return cart;
  }

  async clearCart(userId: string): Promise<void> {
    this.carts.delete(userId);
  }

  // Заказы
  async createOrder(insertOrder: InsertOrder): Promise<Order> {
    const id = randomUUID();
    const order: Order = {
      id,
      userId: insertOrder.userId,
      items: normalizeOrderItems(insertOrder.items),
      amount: insertOrder.amount,
      status: insertOrder.status ?? 'new',
      paymentId: insertOrder.paymentId ?? null,
      createdAt: new Date(),
    };
    this.orders.set(id, order);
    return order;
  }

  async getOrderById(id: string): Promise<Order | undefined> {
    return this.orders.get(id);
  }

  async getOrdersByUserId(userId: string): Promise<Order[]> {
    return Array.from(this.orders.values()).filter(o => o.userId === userId);
  }

  async updateOrderStatus(id: string, status: string, paymentId?: string): Promise<Order | undefined> {
    const order = this.orders.get(id);
    if (!order) return undefined;
    
    const updated = { ...order, status, ...(paymentId && { paymentId }) };
    this.orders.set(id, updated);
    return updated;
  }

  // Fortune Wheel
  async getSpinTokens(userId: string): Promise<FortuneSpinTokens> {
    let tokens = this.spinTokens.get(userId);
    if (!tokens) {
      tokens = { userId, tokens: 3 };
      this.spinTokens.set(userId, tokens);
    }
    return tokens;
  }

  async decrementSpinTokens(userId: string): Promise<FortuneSpinTokens | undefined> {
    const tokens = this.spinTokens.get(userId);
    if (!tokens || tokens.tokens <= 0) return undefined;
    
    const updated = { ...tokens, tokens: tokens.tokens - 1 };
    this.spinTokens.set(userId, updated);
    return updated;
  }

  async incrementSpinTokens(userId: string, amount: number): Promise<FortuneSpinTokens> {
    let tokens = this.spinTokens.get(userId);
    if (!tokens) {
      tokens = { userId, tokens: 0 };
    }
    
    const updated = { ...tokens, tokens: tokens.tokens + amount };
    this.spinTokens.set(userId, updated);
    return updated;
  }

  async createSpin(insertSpin: InsertSpin): Promise<Spin> {
    const id = randomUUID();
    const spin: Spin = {
      ...insertSpin,
      id,
      createdAt: new Date(),
    };
    this.spins.set(id, spin);
    return spin;
  }

  async createPrize(insertPrize: InsertPrize): Promise<Prize> {
    const id = randomUUID();
    const prize: Prize = {
      id,
      userId: insertPrize.userId,
      name: insertPrize.name,
      type: insertPrize.type,
      value: insertPrize.value,
      claimed: insertPrize.claimed ?? false,
      claimedAt: insertPrize.claimedAt ?? null,
      orderId: insertPrize.orderId ?? null,
      createdAt: new Date(),
    };
    this.prizes.set(id, prize);
    return prize;
  }

  async getPrizesByUserId(userId: string): Promise<Prize[]> {
    return Array.from(this.prizes.values()).filter(p => p.userId === userId);
  }

  async updatePrize(id: string, updates: Partial<Prize>): Promise<Prize | undefined> {
    const prize = this.prizes.get(id);
    if (!prize) return undefined;
    
    const updated = { ...prize, ...updates };
    this.prizes.set(id, updated);
    return updated;
  }

  // AI Assistant
  async createConversation(insertConversation: InsertConversation): Promise<Conversation> {
    const id = randomUUID();
    const conversation: Conversation = {
      ...insertConversation,
      id,
      createdAt: new Date(),
    };
    this.conversations.set(id, conversation);
    return conversation;
  }

  async getConversationById(id: string): Promise<Conversation | undefined> {
    return this.conversations.get(id);
  }

  async getConversationsByUserId(userId: string): Promise<Conversation[]> {
    return Array.from(this.conversations.values()).filter(c => c.userId === userId);
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = randomUUID();
    const message: Message = {
      ...insertMessage,
      id,
      createdAt: new Date(),
    };
    this.messages.set(id, message);
    return message;
  }

  async getMessagesByConversationId(conversationId: string): Promise<Message[]> {
    return Array.from(this.messages.values())
      .filter(m => m.conversationId === conversationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  // Платежи
  async createPaymentIntent(insertIntent: InsertPaymentIntent): Promise<PaymentIntent> {
    const id = randomUUID();
    const intent: PaymentIntent = {
      id,
      orderId: insertIntent.orderId,
      provider: insertIntent.provider ?? 'SBP',
      status: insertIntent.status ?? 'pending',
      amount: insertIntent.amount,
      redirectUrl: insertIntent.redirectUrl ?? null,
      raw: insertIntent.raw ?? null,
      createdAt: new Date(),
    };
    this.paymentIntents.set(id, intent);
    return intent;
  }

  async getPaymentIntentById(id: string): Promise<PaymentIntent | undefined> {
    return this.paymentIntents.get(id);
  }

  async getPaymentIntentByOrderId(orderId: string): Promise<PaymentIntent | undefined> {
    return Array.from(this.paymentIntents.values()).find(pi => pi.orderId === orderId);
  }

  async updatePaymentIntentStatus(id: string, status: string, raw?: any): Promise<PaymentIntent | undefined> {
    const intent = this.paymentIntents.get(id);
    if (!intent) return undefined;
    
    const updated = { ...intent, status, ...(raw && { raw }) };
    this.paymentIntents.set(id, updated);
    return updated;
  }
}

export const storage = new MemStorage();

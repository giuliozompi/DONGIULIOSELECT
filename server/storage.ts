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
  type Bonus,
  type InsertBonus,
  type Conversation,
  type InsertConversation,
  type Message,
  type InsertMessage,
  type PaymentIntent,
  type InsertPaymentIntent,
  type UserAddress,
  type InsertUserAddress,
  type PickupAddress,
  type InsertPickupAddress,
  type OrderChangeLog,
  type InsertOrderChangeLog,
  type ProductAssociation,
  type InsertProductAssociation,
  type AdminActionLog,
  type InsertAdminActionLog,
  type ProductMarkingLog,
  type InsertProductMarkingLog,
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
    sortPriority: input.sortPriority ?? 0,
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
    requiresMarking: input.requiresMarking ?? false,
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
  getUserById(id: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined>;
  getPurchasedProducts(userId: string): Promise<Product[]>;

  // Администраторы
  isAdmin(userId: string): Promise<boolean>;
  addAdmin(userId: string, telegramUsername?: string): Promise<void>;
  removeAdmin(userId: string): Promise<void>;
  getAllAdmins(): Promise<Array<{ userId: string; telegramUsername: string | null; createdAt: Date }>>;

  // Категории
  getAllCategories(): Promise<Category[]>;
  getCategoryById(id: string): Promise<Category | undefined>;
  getCategoryBySlug(slug: string): Promise<Category | undefined>;
  createCategory(category: InsertCategory): Promise<Category>;
  updateCategory(id: string, updates: Partial<InsertCategory>): Promise<Category | undefined>;
  deleteCategory(id: string): Promise<boolean>;

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

  // Preferiti
  getFavoriteProducts(userId: string): Promise<Product[]>;
  addFavoriteProduct(userId: string, productId: string): Promise<void>;
  removeFavoriteProduct(userId: string, productId: string): Promise<void>;
  isFavoriteProduct(userId: string, productId: string): Promise<boolean>;

  // Заказы
  createOrder(order: InsertOrder): Promise<Order>;
  getOrderById(id: string): Promise<Order | undefined>;
  getOrdersByUserId(userId: string): Promise<Order[]>;
  getAllOrders(filters?: { status?: string; limit?: number }): Promise<Order[]>;
  updateOrderStatus(id: string, status: string, paymentId?: string): Promise<Order | undefined>;
  updateOrder(id: string, updates: Partial<Order>): Promise<Order | undefined>;
  deleteOrder(id: string): Promise<boolean>; // Solo Master Admin - cancella ordine con cascade

  // Fortune Wheel
  getSpinTokens(userId: string): Promise<FortuneSpinTokens>;
  decrementSpinTokens(userId: string): Promise<FortuneSpinTokens | undefined>;
  incrementSpinTokens(userId: string, amount: number): Promise<FortuneSpinTokens>;
  awardSpinTokensForOrder(orderId: string, userId: string): Promise<boolean>;
  createSpin(spin: InsertSpin): Promise<Spin>;
  createPrize(prize: InsertPrize): Promise<Prize>;
  getPrizesByUserId(userId: string): Promise<Prize[]>;
  getAllPrizes(): Promise<Prize[]>;
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

  // Бонусы
  createBonus(bonus: InsertBonus): Promise<Bonus>;
  getUnusedBonusesByUserId(userId: string): Promise<Bonus[]>;
  markBonusAsUsed(id: string, orderId: string): Promise<Bonus | undefined>;
  getBonusesByUserId(userId: string): Promise<Bonus[]>;

  // Indirizzi utente
  getUserAddresses(userId: string): Promise<UserAddress[]>;
  createUserAddress(address: InsertUserAddress): Promise<UserAddress>;
  updateUserAddress(id: string, updates: Partial<UserAddress>): Promise<UserAddress | undefined>;
  deleteUserAddress(id: string): Promise<boolean>;
  setDefaultAddress(userId: string, addressId: string): Promise<void>;

  // Indirizzi di pick-up
  getPickupAddresses(): Promise<PickupAddress[]>;
  createPickupAddress(address: InsertPickupAddress): Promise<PickupAddress>;
  updatePickupAddress(id: string, updates: Partial<PickupAddress>): Promise<PickupAddress | undefined>;
  deletePickupAddress(id: string): Promise<boolean>;
  setDefaultPickupAddress(addressId: string): Promise<void>;

  // Log modifiche ordini
  createOrderChangeLog(log: InsertOrderChangeLog): Promise<OrderChangeLog>;
  getOrderChangeLogs(orderId: string): Promise<OrderChangeLog[]>;

  // Associazioni prodotti (raccomandazioni)
  getProductAssociations(sourceProductId: string): Promise<Array<ProductAssociation & { targetProduct: Product }>>;
  getAllProductAssociations(): Promise<Array<ProductAssociation & { sourceProduct: Product; targetProduct: Product }>>;
  createProductAssociation(association: InsertProductAssociation): Promise<ProductAssociation>;
  deleteProductAssociation(id: string): Promise<boolean>;

  // Log azioni amministrative
  isMasterAdmin(userId: string): Promise<boolean>;
  createAdminActionLog(log: InsertAdminActionLog): Promise<AdminActionLog>;
  getAdminActionLogs(filters?: { entityType?: string; entityId?: string; limit?: number }): Promise<AdminActionLog[]>;
  
  // Log маркировки продуктов
  createMarkingLog(log: InsertProductMarkingLog): Promise<ProductMarkingLog>;
  getMarkingLogsByOrder(orderId: string): Promise<ProductMarkingLog[]>;
  getMarkingLogsByProduct(productId: string): Promise<ProductMarkingLog[]>;
  isMarkingCodeUsed(markingCode: string): Promise<boolean>;
  getMarkingLogByCode(markingCode: string): Promise<ProductMarkingLog | undefined>;
  deleteMarkingLog(logId: string): Promise<void>;
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
      { id: '1', name: 'Сыры', slug: 'cheese', image: null, parentId: null, sortOrder: 1 },
      { id: '2', name: 'Твердые сыры', slug: 'hard-cheese', image: null, parentId: '1', sortOrder: 1 },
      { id: '3', name: 'Мягкие сыры', slug: 'soft-cheese', image: null, parentId: '1', sortOrder: 2 },
      { id: '4', name: 'Колбасы', slug: 'salami', image: null, parentId: null, sortOrder: 2 },
      { id: '5', name: 'Салями', slug: 'salami-type', image: null, parentId: '4', sortOrder: 1 },
      { id: '6', name: 'Прошутто', slug: 'prosciutto', image: null, parentId: '4', sortOrder: 2 },
      { id: '7', name: 'Масла и соусы', slug: 'oils', image: null, parentId: null, sortOrder: 3 },
      { id: '8', name: 'Оливковое масло', slug: 'olive-oil', image: null, parentId: '7', sortOrder: 1 },
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

  async getUserById(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const user: User = {
      id: insertUser.id,
      username: insertUser.username ?? null,
      firstName: insertUser.firstName ?? null,
      lastName: insertUser.lastName ?? null,
      phone: insertUser.phone ?? null,
      email: insertUser.email ?? null,
      customerName: insertUser.customerName ?? null,
    };
    this.users.set(user.id, user);
    return user;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    
    const updated: User = {
      ...user,
      ...(updates.username !== undefined && { username: updates.username }),
      ...(updates.firstName !== undefined && { firstName: updates.firstName }),
      ...(updates.lastName !== undefined && { lastName: updates.lastName }),
      ...(updates.phone !== undefined && { phone: updates.phone }),
      ...(updates.email !== undefined && { email: updates.email }),
      ...(updates.customerName !== undefined && { customerName: updates.customerName }),
    };
    this.users.set(id, updated);
    return updated;
  }

  // Администраторы (stub - not used in production)
  private admins: Map<string, { userId: string; telegramUsername: string | null; createdAt: Date }> = new Map();

  async isAdmin(userId: string): Promise<boolean> {
    return this.admins.has(userId);
  }

  async addAdmin(userId: string, telegramUsername?: string): Promise<void> {
    const existing = this.admins.get(userId);
    this.admins.set(userId, {
      userId,
      telegramUsername: telegramUsername || existing?.telegramUsername || null,
      createdAt: existing?.createdAt || new Date(),
    });
  }

  async removeAdmin(userId: string): Promise<void> {
    this.admins.delete(userId);
  }

  async getAllAdmins(): Promise<Array<{ userId: string; telegramUsername: string | null; createdAt: Date }>> {
    return Array.from(this.admins.values());
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
      image: insertCategory.image ?? null,
      parentId: insertCategory.parentId ?? null,
      sortOrder: insertCategory.sortOrder ?? 0,
    };
    this.categories.set(id, category);
    return category;
  }

  async updateCategory(id: string, updates: Partial<InsertCategory>): Promise<Category | undefined> {
    const category = this.categories.get(id);
    if (!category) return undefined;
    
    const updated = { ...category, ...updates };
    this.categories.set(id, updated);
    return updated;
  }

  async deleteCategory(id: string): Promise<boolean> {
    return this.categories.delete(id);
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
      discount: insertOrder.discount ?? null,
      discountType: insertOrder.discountType ?? null,
      discountValue: insertOrder.discountValue ?? null,
      customerName: insertOrder.customerName,
      customerPhone: insertOrder.customerPhone,
      customerEmail: insertOrder.customerEmail ?? null,
      deliveryAddress: insertOrder.deliveryAddress,
      deliveryPostalCode: insertOrder.deliveryPostalCode ?? null,
      dadataFiasId: insertOrder.dadataFiasId ?? null,
      deliveryNotes: insertOrder.deliveryNotes ?? null,
      deliveryMethod: insertOrder.deliveryMethod ?? null,
      status: insertOrder.status ?? 'ОФОРМЛЕН',
      paymentId: insertOrder.paymentId ?? null,
      paymentLinkSentAt: insertOrder.paymentLinkSentAt ?? null,
      spinTokensAwarded: insertOrder.spinTokensAwarded ?? false,
      courierService: insertOrder.courierService ?? null,
      courierOrderId: insertOrder.courierOrderId ?? null,
      courierTrackingUrl: insertOrder.courierTrackingUrl ?? null,
      courierCalledAt: insertOrder.courierCalledAt ?? null,
      createdAt: new Date(),
    };
    this.orders.set(id, order);
    return order;
  }

  async getOrderById(id: string): Promise<Order | undefined> {
    return this.orders.get(id);
  }

  async getOrdersByUserId(userId: string): Promise<Order[]> {
    return Array.from(this.orders.values())
      .filter(o => o.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getAllOrders(filters?: { status?: string; limit?: number }): Promise<Order[]> {
    let orders = Array.from(this.orders.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    if (filters?.status) {
      orders = orders.filter(o => o.status === filters.status);
    }
    
    if (filters?.limit) {
      orders = orders.slice(0, filters.limit);
    }
    
    return orders;
  }

  async updateOrderStatus(id: string, status: string, paymentId?: string): Promise<Order | undefined> {
    const order = this.orders.get(id);
    if (!order) return undefined;
    
    const updated = { ...order, status, ...(paymentId && { paymentId }) };
    this.orders.set(id, updated);
    return updated;
  }

  async updateOrder(id: string, updates: Partial<Order>): Promise<Order | undefined> {
    const order = this.orders.get(id);
    if (!order) return undefined;
    
    const updated = { ...order, ...updates };
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

  async awardSpinTokensForOrder(orderId: string, userId: string): Promise<boolean> {
    const order = this.orders.get(orderId);
    if (!order || order.spinTokensAwarded) {
      return false;
    }
    
    // Imposta il flag
    order.spinTokensAwarded = true;
    this.orders.set(orderId, order);
    
    // Incrementa tokens
    await this.incrementSpinTokens(userId, 1);
    
    return true;
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
      productIds: insertPrize.productIds ?? null,
      claimed: insertPrize.claimed ?? false,
      claimedAt: insertPrize.claimedAt ?? null,
      orderId: insertPrize.orderId ?? null,
      adminUsedBy: insertPrize.adminUsedBy ?? null,
      createdAt: new Date(),
    };
    this.prizes.set(id, prize);
    return prize;
  }

  async getPrizesByUserId(userId: string): Promise<Prize[]> {
    return Array.from(this.prizes.values()).filter(p => p.userId === userId);
  }

  async getAllPrizes(): Promise<Prize[]> {
    return Array.from(this.prizes.values());
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

  // Бонусы (MemStorage stub - не используется)
  private bonuses: Map<string, Bonus> = new Map();

  async createBonus(insertBonus: InsertBonus): Promise<Bonus> {
    const id = randomUUID();
    const bonus: Bonus = {
      id,
      userId: insertBonus.userId,
      percentage: insertBonus.percentage,
      amount: insertBonus.amount,
      fromOrderId: insertBonus.fromOrderId ?? null,
      used: insertBonus.used ?? false,
      usedInOrderId: insertBonus.usedInOrderId ?? null,
      createdAt: new Date(),
    };
    this.bonuses.set(id, bonus);
    return bonus;
  }

  async getUnusedBonusesByUserId(userId: string): Promise<Bonus[]> {
    return Array.from(this.bonuses.values())
      .filter(b => b.userId === userId && !b.used)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()); // FIFO
  }

  async markBonusAsUsed(id: string, orderId: string): Promise<Bonus | undefined> {
    const bonus = this.bonuses.get(id);
    if (!bonus) return undefined;
    
    const updated = { ...bonus, used: true, usedInOrderId: orderId };
    this.bonuses.set(id, updated);
    return updated;
  }

  async getBonusesByUserId(userId: string): Promise<Bonus[]> {
    return Array.from(this.bonuses.values())
      .filter(b => b.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()); // Newest first
  }

  // Preferiti (stub - non implementato in MemStorage)
  async getFavoriteProducts(_userId: string): Promise<Product[]> {
    return [];
  }

  async addFavoriteProduct(_userId: string, _productId: string): Promise<void> {
    // Not implemented
  }

  async removeFavoriteProduct(_userId: string, _productId: string): Promise<void> {
    // Not implemented
  }

  async isFavoriteProduct(_userId: string, _productId: string): Promise<boolean> {
    return false;
  }

  // Log маркировки продуктов (stub - non implementato in MemStorage)
  private markingLogs: Map<string, ProductMarkingLog> = new Map();

  async createMarkingLog(log: InsertProductMarkingLog): Promise<ProductMarkingLog> {
    const id = randomUUID();
    const markingLog: ProductMarkingLog = {
      id,
      productId: log.productId,
      orderId: log.orderId,
      markingCode: log.markingCode,
      operatorId: log.operatorId,
      operatorUsername: log.operatorUsername ?? null,
      scannedAt: new Date(),
      orderDate: log.orderDate,
    };
    this.markingLogs.set(id, markingLog);
    return markingLog;
  }

  async getMarkingLogsByOrder(orderId: string): Promise<ProductMarkingLog[]> {
    return Array.from(this.markingLogs.values())
      .filter(log => log.orderId === orderId)
      .sort((a, b) => a.scannedAt.getTime() - b.scannedAt.getTime());
  }

  async getMarkingLogsByProduct(productId: string): Promise<ProductMarkingLog[]> {
    return Array.from(this.markingLogs.values())
      .filter(log => log.productId === productId)
      .sort((a, b) => b.scannedAt.getTime() - a.scannedAt.getTime());
  }

  async isMarkingCodeUsed(markingCode: string): Promise<boolean> {
    return Array.from(this.markingLogs.values()).some(log => log.markingCode === markingCode);
  }

  async getMarkingLogByCode(markingCode: string): Promise<ProductMarkingLog | undefined> {
    return Array.from(this.markingLogs.values()).find(log => log.markingCode === markingCode);
  }

  async deleteMarkingLog(logId: string): Promise<void> {
    this.markingLogs.delete(logId);
  }
}

// export const storage = new MemStorage(); // Old in-memory storage
import { DbStorage } from './dbStorage';
export const storage = new DbStorage(); // New persistent database storage

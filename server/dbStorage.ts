import { eq, and, desc } from 'drizzle-orm';
import { db } from './db';
import {
  users,
  admins,
  categories,
  products,
  carts,
  orders,
  fortuneSpinTokens,
  prizes,
  spins,
  bonuses,
  conversations,
  messages,
  paymentIntents,
  type User,
  type InsertUser,
  type Admin,
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
} from '@shared/schema';
import type { IStorage } from './storage';

export class DbStorage implements IStorage {
  // Пользователи
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  // Администраторы
  async isAdmin(userId: string): Promise<boolean> {
    const result = await db.select().from(admins).where(eq(admins.userId, userId));
    return result.length > 0;
  }

  async addAdmin(userId: string): Promise<void> {
    await db.insert(admins).values({ userId }).onConflictDoNothing();
  }

  async removeAdmin(userId: string): Promise<void> {
    await db.delete(admins).where(eq(admins.userId, userId));
  }

  // Категории
  async getAllCategories(): Promise<Category[]> {
    return await db.select().from(categories);
  }

  async getCategoryById(id: string): Promise<Category | undefined> {
    const result = await db.select().from(categories).where(eq(categories.id, id));
    return result[0];
  }

  async getCategoryBySlug(slug: string): Promise<Category | undefined> {
    const result = await db.select().from(categories).where(eq(categories.slug, slug));
    return result[0];
  }

  async createCategory(insertCategory: InsertCategory): Promise<Category> {
    const result = await db.insert(categories).values(insertCategory).returning();
    return result[0];
  }

  async updateCategory(id: string, updates: Partial<InsertCategory>): Promise<Category | undefined> {
    const result = await db.update(categories)
      .set(updates)
      .where(eq(categories.id, id))
      .returning();
    return result[0];
  }

  async deleteCategory(id: string): Promise<boolean> {
    const result = await db.delete(categories).where(eq(categories.id, id)).returning();
    return result.length > 0;
  }

  // Продукты
  async getAllProducts(filters?: { categoryId?: string; inStock?: boolean }): Promise<Product[]> {
    let query = db.select().from(products);
    
    if (filters?.categoryId && filters?.inStock !== undefined) {
      query = query.where(
        and(
          eq(products.categoryId, filters.categoryId),
          eq(products.inStock, filters.inStock)
        )
      ) as typeof query;
    } else if (filters?.categoryId) {
      query = query.where(eq(products.categoryId, filters.categoryId)) as typeof query;
    } else if (filters?.inStock !== undefined) {
      query = query.where(eq(products.inStock, filters.inStock)) as typeof query;
    }
    
    return await query;
  }

  async getProductById(id: string): Promise<Product | undefined> {
    const result = await db.select().from(products).where(eq(products.id, id));
    return result[0];
  }

  async getProductBySlug(slug: string): Promise<Product | undefined> {
    const result = await db.select().from(products).where(eq(products.slug, slug));
    return result[0];
  }

  async createProduct(insertProduct: InsertProduct): Promise<Product> {
    const result = await db.insert(products).values(insertProduct as any).returning();
    return result[0];
  }

  async updateProduct(id: string, updates: Partial<InsertProduct>): Promise<Product | undefined> {
    const result = await db
      .update(products)
      .set(updates as any)
      .where(eq(products.id, id))
      .returning();
    return result[0];
  }

  async deleteProduct(id: string): Promise<boolean> {
    const result = await db.delete(products).where(eq(products.id, id)).returning();
    return result.length > 0;
  }

  // Корзина (PERSISTENTE!)
  async getCart(userId: string): Promise<Cart | undefined> {
    const result = await db.select().from(carts).where(eq(carts.userId, userId));
    return result[0];
  }

  async setCart(userId: string, items: Cart['items']): Promise<Cart> {
    // Upsert: se esiste aggiorna, altrimenti inserisci
    const existing = await this.getCart(userId);
    
    if (existing) {
      const result = await db
        .update(carts)
        .set({ items, updatedAt: new Date() })
        .where(eq(carts.userId, userId))
        .returning();
      return result[0];
    } else {
      const result = await db
        .insert(carts)
        .values({ userId, items, updatedAt: new Date() })
        .returning();
      return result[0];
    }
  }

  async clearCart(userId: string): Promise<void> {
    await db.delete(carts).where(eq(carts.userId, userId));
  }

  // Заказы
  async createOrder(insertOrder: InsertOrder): Promise<Order> {
    const result = await db.insert(orders).values(insertOrder as any).returning();
    return result[0];
  }

  async getOrderById(id: string): Promise<Order | undefined> {
    const result = await db.select().from(orders).where(eq(orders.id, id));
    return result[0];
  }

  async getOrdersByUserId(userId: string): Promise<Order[]> {
    return await db
      .select()
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt));
  }

  async updateOrderStatus(id: string, status: string, paymentId?: string): Promise<Order | undefined> {
    const result = await db
      .update(orders)
      .set({ status, ...(paymentId && { paymentId }) })
      .where(eq(orders.id, id))
      .returning();
    return result[0];
  }

  // Fortune Wheel
  async getSpinTokens(userId: string): Promise<FortuneSpinTokens> {
    const result = await db
      .select()
      .from(fortuneSpinTokens)
      .where(eq(fortuneSpinTokens.userId, userId));
    
    if (result[0]) {
      return result[0];
    }
    
    // Crea entry con 3 token iniziali
    const newTokens = await db
      .insert(fortuneSpinTokens)
      .values({ userId, tokens: 3 })
      .returning();
    return newTokens[0];
  }

  async decrementSpinTokens(userId: string): Promise<FortuneSpinTokens | undefined> {
    const current = await this.getSpinTokens(userId);
    if (current.tokens <= 0) return undefined;
    
    const result = await db
      .update(fortuneSpinTokens)
      .set({ tokens: current.tokens - 1 })
      .where(eq(fortuneSpinTokens.userId, userId))
      .returning();
    return result[0];
  }

  async incrementSpinTokens(userId: string, amount: number): Promise<FortuneSpinTokens> {
    const current = await this.getSpinTokens(userId);
    
    const result = await db
      .update(fortuneSpinTokens)
      .set({ tokens: current.tokens + amount })
      .where(eq(fortuneSpinTokens.userId, userId))
      .returning();
    return result[0];
  }

  async createSpin(insertSpin: InsertSpin): Promise<Spin> {
    const result = await db.insert(spins).values(insertSpin).returning();
    return result[0];
  }

  async createPrize(insertPrize: InsertPrize): Promise<Prize> {
    const result = await db.insert(prizes).values(insertPrize).returning();
    return result[0];
  }

  async getPrizesByUserId(userId: string): Promise<Prize[]> {
    return await db
      .select()
      .from(prizes)
      .where(eq(prizes.userId, userId))
      .orderBy(desc(prizes.createdAt));
  }

  async updatePrize(id: string, updates: Partial<Prize>): Promise<Prize | undefined> {
    const result = await db
      .update(prizes)
      .set(updates)
      .where(eq(prizes.id, id))
      .returning();
    return result[0];
  }

  // AI Assistant
  async createConversation(insertConversation: InsertConversation): Promise<Conversation> {
    const result = await db.insert(conversations).values(insertConversation).returning();
    return result[0];
  }

  async getConversationById(id: string): Promise<Conversation | undefined> {
    const result = await db.select().from(conversations).where(eq(conversations.id, id));
    return result[0];
  }

  async getConversationsByUserId(userId: string): Promise<Conversation[]> {
    return await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.createdAt));
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const result = await db.insert(messages).values(insertMessage).returning();
    return result[0];
  }

  async getMessagesByConversationId(conversationId: string): Promise<Message[]> {
    return await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);
  }

  // Платежи
  async createPaymentIntent(insertIntent: InsertPaymentIntent): Promise<PaymentIntent> {
    const result = await db.insert(paymentIntents).values(insertIntent).returning();
    return result[0];
  }

  async getPaymentIntentById(id: string): Promise<PaymentIntent | undefined> {
    const result = await db.select().from(paymentIntents).where(eq(paymentIntents.id, id));
    return result[0];
  }

  async getPaymentIntentByOrderId(orderId: string): Promise<PaymentIntent | undefined> {
    const result = await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.orderId, orderId));
    return result[0];
  }

  async updatePaymentIntentStatus(id: string, status: string, raw?: any): Promise<PaymentIntent | undefined> {
    const result = await db
      .update(paymentIntents)
      .set({ status, ...(raw && { raw }) })
      .where(eq(paymentIntents.id, id))
      .returning();
    return result[0];
  }

  // Бонусы
  async createBonus(insertBonus: InsertBonus): Promise<Bonus> {
    const result = await db.insert(bonuses).values(insertBonus).returning();
    return result[0];
  }

  async getUnusedBonusesByUserId(userId: string): Promise<Bonus[]> {
    return await db
      .select()
      .from(bonuses)
      .where(and(eq(bonuses.userId, userId), eq(bonuses.used, false)))
      .orderBy(bonuses.createdAt); // FIFO: ordine cronologico
  }

  async markBonusAsUsed(id: string, orderId: string): Promise<Bonus | undefined> {
    const result = await db
      .update(bonuses)
      .set({ used: true, usedInOrderId: orderId })
      .where(eq(bonuses.id, id))
      .returning();
    return result[0];
  }

  async getBonusesByUserId(userId: string): Promise<Bonus[]> {
    return await db
      .select()
      .from(bonuses)
      .where(eq(bonuses.userId, userId))
      .orderBy(desc(bonuses.createdAt));
  }
}

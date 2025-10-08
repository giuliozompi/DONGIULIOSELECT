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
  userAddresses,
  orderChangeLogs,
  productAssociations,
  adminActionLogs,
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
  type UserAddress,
  type InsertUserAddress,
  type OrderChangeLog,
  type InsertOrderChangeLog,
  type ProductAssociation,
  type InsertProductAssociation,
  type AdminActionLog,
  type InsertAdminActionLog,
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

  async addAdmin(userId: string, telegramUsername?: string): Promise<void> {
    await db.insert(admins)
      .values({ userId, telegramUsername: telegramUsername || null })
      .onConflictDoUpdate({
        target: admins.userId,
        set: {
          telegramUsername: telegramUsername || null,
        },
      });
  }

  async removeAdmin(userId: string): Promise<void> {
    await db.delete(admins).where(eq(admins.userId, userId));
  }

  async getAllAdmins(): Promise<Array<{ userId: string; telegramUsername: string | null; createdAt: Date }>> {
    const result = await db.select().from(admins);
    return result.map(admin => ({
      userId: admin.userId,
      telegramUsername: admin.telegramUsername,
      createdAt: admin.createdAt,
    }));
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

  async getAllOrders(filters?: { status?: string; limit?: number }): Promise<Order[]> {
    let query = db.select().from(orders);
    
    if (filters?.status) {
      query = query.where(eq(orders.status, filters.status)) as typeof query;
    }
    
    query = query.orderBy(desc(orders.createdAt)) as typeof query;
    
    if (filters?.limit) {
      query = query.limit(filters.limit) as typeof query;
    }
    
    return await query;
  }

  async updateOrderStatus(id: string, status: string, paymentId?: string): Promise<Order | undefined> {
    const result = await db
      .update(orders)
      .set({ status, ...(paymentId && { paymentId }) })
      .where(eq(orders.id, id))
      .returning();
    return result[0];
  }

  async updateOrder(id: string, updates: Partial<Order>): Promise<Order | undefined> {
    const result = await db
      .update(orders)
      .set(updates as any)
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

  // Indirizzi utente
  async getUserAddresses(userId: string): Promise<UserAddress[]> {
    return await db
      .select()
      .from(userAddresses)
      .where(eq(userAddresses.userId, userId))
      .orderBy(desc(userAddresses.isDefault), desc(userAddresses.createdAt));
  }

  async createUserAddress(address: InsertUserAddress): Promise<UserAddress> {
    const result = await db.insert(userAddresses).values(address).returning();
    return result[0];
  }

  async updateUserAddress(id: string, updates: Partial<UserAddress>): Promise<UserAddress | undefined> {
    const result = await db
      .update(userAddresses)
      .set(updates)
      .where(eq(userAddresses.id, id))
      .returning();
    return result[0];
  }

  async deleteUserAddress(id: string): Promise<boolean> {
    const result = await db.delete(userAddresses).where(eq(userAddresses.id, id)).returning();
    return result.length > 0;
  }

  async setDefaultAddress(userId: string, addressId: string): Promise<void> {
    // Reset all addresses to non-default
    await db
      .update(userAddresses)
      .set({ isDefault: false })
      .where(eq(userAddresses.userId, userId));
    
    // Set the selected address as default
    await db
      .update(userAddresses)
      .set({ isDefault: true })
      .where(eq(userAddresses.id, addressId));
  }

  // Log modifiche ordini
  async createOrderChangeLog(insertLog: InsertOrderChangeLog): Promise<OrderChangeLog> {
    const result = await db.insert(orderChangeLogs).values(insertLog as any).returning();
    return result[0];
  }

  async getOrderChangeLogs(orderId: string): Promise<OrderChangeLog[]> {
    return await db
      .select()
      .from(orderChangeLogs)
      .where(eq(orderChangeLogs.orderId, orderId))
      .orderBy(desc(orderChangeLogs.createdAt));
  }

  // Associazioni prodotti (raccomandazioni)
  async getProductAssociations(sourceProductId: string): Promise<Array<ProductAssociation & { targetProduct: Product }>> {
    const results = await db
      .select({
        id: productAssociations.id,
        sourceProductId: productAssociations.sourceProductId,
        targetProductId: productAssociations.targetProductId,
        reason: productAssociations.reason,
        sortOrder: productAssociations.sortOrder,
        createdAt: productAssociations.createdAt,
        targetProduct: products,
      })
      .from(productAssociations)
      .innerJoin(products, eq(productAssociations.targetProductId, products.id))
      .where(eq(productAssociations.sourceProductId, sourceProductId))
      .orderBy(productAssociations.sortOrder);
    
    return results.map(r => ({
      id: r.id,
      sourceProductId: r.sourceProductId,
      targetProductId: r.targetProductId,
      reason: r.reason,
      sortOrder: r.sortOrder,
      createdAt: r.createdAt,
      targetProduct: r.targetProduct,
    }));
  }

  async getAllProductAssociations(): Promise<Array<ProductAssociation & { sourceProduct: Product; targetProduct: Product }>> {
    const results = await db
      .select({
        id: productAssociations.id,
        sourceProductId: productAssociations.sourceProductId,
        targetProductId: productAssociations.targetProductId,
        reason: productAssociations.reason,
        sortOrder: productAssociations.sortOrder,
        createdAt: productAssociations.createdAt,
        sourceProduct: {
          id: products.id,
          name: products.name,
          slug: products.slug,
          categoryId: products.categoryId,
          images: products.images,
          price: products.price,
          priceOld: products.priceOld,
          unit: products.unit,
          inStock: products.inStock,
          tasteVariations: products.tasteVariations,
          tasteRatingStats: products.tasteRatingStats,
          descriptionShort: products.descriptionShort,
          descriptionFull: products.descriptionFull,
          nutrition: products.nutrition,
        },
      })
      .from(productAssociations)
      .innerJoin(products, eq(productAssociations.sourceProductId, products.id))
      .orderBy(productAssociations.sortOrder);
    
    // Ottieni prodotti target separatamente
    const associationsWithTargets = await Promise.all(
      results.map(async (r) => {
        const targetProduct = await db.select().from(products).where(eq(products.id, r.targetProductId));
        return {
          id: r.id,
          sourceProductId: r.sourceProductId,
          targetProductId: r.targetProductId,
          reason: r.reason,
          sortOrder: r.sortOrder,
          createdAt: r.createdAt,
          sourceProduct: r.sourceProduct as Product,
          targetProduct: targetProduct[0] as Product,
        };
      })
    );
    
    return associationsWithTargets;
  }

  async createProductAssociation(insertAssociation: InsertProductAssociation): Promise<ProductAssociation> {
    const result = await db.insert(productAssociations).values(insertAssociation).returning();
    return result[0];
  }

  async deleteProductAssociation(id: string): Promise<boolean> {
    const result = await db.delete(productAssociations).where(eq(productAssociations.id, id)).returning();
    return result.length > 0;
  }

  // ==================== ADMIN ACTION LOGS ====================

  async isMasterAdmin(userId: string): Promise<boolean> {
    const masterAdminUserId = process.env.MASTER_ADMIN_USER_ID;
    return userId === masterAdminUserId;
  }

  async createAdminActionLog(log: InsertAdminActionLog): Promise<AdminActionLog> {
    const result = await db.insert(adminActionLogs).values(log).returning();
    return result[0];
  }

  async getAdminActionLogs(filters?: { entityType?: string; entityId?: string; limit?: number }): Promise<AdminActionLog[]> {
    let query = db.select().from(adminActionLogs);
    
    if (filters?.entityType) {
      query = query.where(eq(adminActionLogs.entityType, filters.entityType)) as any;
    }
    
    if (filters?.entityId) {
      query = query.where(eq(adminActionLogs.entityId, filters.entityId)) as any;
    }
    
    const results = await query.orderBy(desc(adminActionLogs.createdAt)).limit(filters?.limit || 100);
    return results;
  }
}

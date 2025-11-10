import { eq, and, desc, asc, sql } from 'drizzle-orm';
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
  pickupAddresses,
  orderChangeLogs,
  productAssociations,
  adminActionLogs,
  favoriteProducts,
  productMarkingLogs,
  orderPoints,
  webhookEvents,
  courierTracking,
  PAID_ORDER_STATUSES,
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
  type OrderPoint,
  type InsertOrderPoint,
  type WebhookEvent,
  type InsertWebhookEvent,
  type CourierTracking,
  type InsertCourierTracking,
} from '@shared/schema';
import type { IStorage } from './storage';

export class DbStorage implements IStorage {
  // Пользователи
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserById(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getAllUsers(): Promise<User[]> {
    const result = await db.select().from(users);
    return result;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    const result = await db.update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return result[0];
  }

  async getPurchasedProducts(userId: string): Promise<Product[]> {
    // Get only completed/paid orders for this user
    const userOrders = await db.select()
      .from(orders)
      .where(eq(orders.userId, userId));
    
    // Filter to only paid/completed orders
    const paidOrders = userOrders.filter(order => 
      PAID_ORDER_STATUSES.includes(order.status as any)
    );
    
    // Extract unique product IDs from paid orders
    const productIds = new Set<string>();
    paidOrders.forEach(order => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach((item: any) => {
          if (item.productId) {
            productIds.add(item.productId);
          }
        });
      }
    });
    
    // Fetch all products by IDs
    if (productIds.size === 0) {
      return [];
    }
    
    const purchasedProducts = await db.select()
      .from(products)
      .where(sql`${products.id} IN ${sql.raw(`(${Array.from(productIds).map(id => `'${id}'`).join(',')})`)}`);
    
    return purchasedProducts;
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
  async getAllCategories(includeHidden = false): Promise<Category[]> {
    let query = db.select().from(categories);
    
    // Filtra solo visibili per il frontend cliente (tranne admin)
    if (!includeHidden) {
      query = query.where(eq(categories.isVisible, true)) as typeof query;
    }
    
    return await query.orderBy(asc(categories.sortOrder));
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
  async getAllProducts(filters?: { categoryId?: string; inStock?: boolean; includeHidden?: boolean }): Promise<Product[]> {
    let query = db.select().from(products);
    
    const conditions = [];
    
    // Aggiungi filtro visibilità (default: solo visibili)
    if (!filters?.includeHidden) {
      conditions.push(eq(products.isVisible, true));
    }
    
    // Aggiungi altri filtri
    if (filters?.categoryId) {
      conditions.push(eq(products.categoryId, filters.categoryId));
    }
    if (filters?.inStock !== undefined) {
      conditions.push(eq(products.inStock, filters.inStock));
    }
    
    // Applica condizioni se presenti
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }
    
    // Ordina per priorità (alta prima) e poi per prezzo (basso prima)
    query = query.orderBy(desc(products.sortPriority), asc(products.price)) as typeof query;
    
    return await query;
  }

  async getProductById(id: string, includeHidden = false): Promise<Product | undefined> {
    let query = db.select().from(products);
    
    const conditions = [eq(products.id, id)];
    
    // Filtra solo visibili per il frontend cliente (tranne admin)
    if (!includeHidden) {
      conditions.push(eq(products.isVisible, true));
    }
    
    const result = await query.where(and(...conditions));
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

  async toggleProductStock(id: string): Promise<{ product: Product; oldStock: boolean; newStock: boolean } | undefined> {
    const product = await this.getProductById(id, true);
    if (!product) return undefined;
    
    const newStock = !product.inStock;
    const updated = await db
      .update(products)
      .set({ inStock: newStock })
      .where(eq(products.id, id))
      .returning();
    
    return {
      product: updated[0],
      oldStock: product.inStock,
      newStock: newStock
    };
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

  // Preferiti
  async getFavoriteProducts(userId: string): Promise<(Product & { categoryName: string })[]> {
    const favorites = await db
      .select({ 
        product: products,
        categoryName: categories.name 
      })
      .from(favoriteProducts)
      .innerJoin(products, eq(favoriteProducts.productId, products.id))
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(eq(favoriteProducts.userId, userId))
      .orderBy(desc(favoriteProducts.createdAt));
    
    return favorites.map(f => ({ ...f.product, categoryName: f.categoryName }));
  }

  async addFavoriteProduct(userId: string, productId: string): Promise<void> {
    await db.insert(favoriteProducts).values({ userId, productId }).onConflictDoNothing();
  }

  async removeFavoriteProduct(userId: string, productId: string): Promise<void> {
    await db
      .delete(favoriteProducts)
      .where(and(
        eq(favoriteProducts.userId, userId),
        eq(favoriteProducts.productId, productId)
      ));
  }

  async isFavoriteProduct(userId: string, productId: string): Promise<boolean> {
    const result = await db
      .select()
      .from(favoriteProducts)
      .where(and(
        eq(favoriteProducts.userId, userId),
        eq(favoriteProducts.productId, productId)
      ))
      .limit(1);
    
    return result.length > 0;
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

  async updateOrderReceipt(id: string, receiptData: {
    receiptId: string;
    receiptUrl?: string;
    receiptStatus: string;
    fiscalData?: {
      fiscal_document_number?: string;
      fiscal_storage_number?: string;
      fiscal_attribute?: string;
      registered_at?: string;
    };
  }): Promise<Order | undefined> {
    // Usa COALESCE per preservare atomicamente i valori esistenti quando non forniti
    const result = await db
      .update(orders)
      .set({
        receiptId: receiptData.receiptId,
        // Usa il nuovo valore se fornito, altrimenti mantieni l'esistente
        receiptUrl: receiptData.receiptUrl !== undefined 
          ? receiptData.receiptUrl 
          : sql`COALESCE(${orders.receiptUrl}, NULL)`,
        receiptStatus: receiptData.receiptStatus,
        // Usa il nuovo valore se fornito, altrimenti mantieni l'esistente
        fiscalData: receiptData.fiscalData !== undefined
          ? receiptData.fiscalData
          : sql`COALESCE(${orders.fiscalData}, NULL)`,
      })
      .where(eq(orders.id, id))
      .returning();
    return result[0];
  }

  async deleteOrder(id: string): Promise<boolean> {
    try {
      // Cancella tutti i dati correlati in ordine (cascade delete manuale)
      
      // 1. Cancella productMarkingLogs per questo ordine
      await db.delete(productMarkingLogs).where(eq(productMarkingLogs.orderId, id));
      
      // 2. Cancella orderChangeLogs per questo ordine
      await db.delete(orderChangeLogs).where(eq(orderChangeLogs.orderId, id));
      
      // 3. Cancella l'ordine stesso
      const result = await db.delete(orders).where(eq(orders.id, id)).returning();
      
      return result.length > 0;
    } catch (error) {
      console.error('Error deleting order:', error);
      return false;
    }
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

  async awardSpinTokensForOrder(orderId: string, userId: string): Promise<boolean> {
    return await db.transaction(async (tx) => {
      // Atomicamente imposta spinTokensAwarded = true solo se è ancora false
      const result = await tx
        .update(orders)
        .set({ spinTokensAwarded: true })
        .where(and(
          eq(orders.id, orderId),
          eq(orders.spinTokensAwarded, false)
        ))
        .returning();
      
      // Se l'update ha modificato una riga, assegna i tokens
      if (result.length > 0) {
        // Verifica se l'utente ha già un record di tokens
        const current = await tx
          .select()
          .from(fortuneSpinTokens)
          .where(eq(fortuneSpinTokens.userId, userId));
        
        if (current[0]) {
          // Incrementa tokens usando SQL atomico (previene lost updates)
          await tx
            .update(fortuneSpinTokens)
            .set({ tokens: sql`${fortuneSpinTokens.tokens} + 1` })
            .where(eq(fortuneSpinTokens.userId, userId));
        } else {
          // Crea nuovo record con 4 tokens (3 iniziali + 1 per questo ordine)
          await tx
            .insert(fortuneSpinTokens)
            .values({ userId, tokens: 4 });
        }
        
        return true;
      }
      
      return false;
    });
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

  async getAllPrizes(): Promise<Prize[]> {
    return await db
      .select()
      .from(prizes)
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

  async getAllPaymentIntents(): Promise<PaymentIntent[]> {
    const result = await db.select().from(paymentIntents);
    return result;
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

  // Indirizzi di pick-up
  async getPickupAddresses(): Promise<PickupAddress[]> {
    return await db
      .select()
      .from(pickupAddresses)
      .orderBy(desc(pickupAddresses.isDefault), desc(pickupAddresses.createdAt));
  }

  async createPickupAddress(address: InsertPickupAddress): Promise<PickupAddress> {
    // Se è il primo indirizzo o se isDefault è true, imposta come default
    const existingAddresses = await this.getPickupAddresses();
    const shouldBeDefault = existingAddresses.length === 0 || address.isDefault === true;
    
    if (shouldBeDefault) {
      // Reset all addresses to non-default
      await db.update(pickupAddresses).set({ isDefault: false });
    }
    
    const result = await db.insert(pickupAddresses).values({
      ...address,
      isDefault: shouldBeDefault,
    }).returning();
    return result[0];
  }

  async updatePickupAddress(id: string, updates: Partial<PickupAddress>): Promise<PickupAddress | undefined> {
    const result = await db
      .update(pickupAddresses)
      .set(updates)
      .where(eq(pickupAddresses.id, id))
      .returning();
    return result[0];
  }

  async deletePickupAddress(id: string): Promise<boolean> {
    const result = await db.delete(pickupAddresses).where(eq(pickupAddresses.id, id)).returning();
    return result.length > 0;
  }

  async setDefaultPickupAddress(addressId: string): Promise<void> {
    // Reset all addresses to non-default
    await db.update(pickupAddresses).set({ isDefault: false });
    
    // Set the selected address as default
    await db
      .update(pickupAddresses)
      .set({ isDefault: true })
      .where(eq(pickupAddresses.id, addressId));
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
    // Supporta fino a 3 Master Admin tramite lista separata da virgole
    const masterAdminUserIds = process.env.MASTER_ADMIN_USER_IDS || process.env.MASTER_ADMIN_USER_ID || '';
    const adminList = masterAdminUserIds.split(',').map(id => id.trim()).filter(id => id.length > 0);
    return adminList.includes(userId);
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

  // ==================== PRODUCT MARKING LOGS ====================

  async createMarkingLog(log: InsertProductMarkingLog): Promise<ProductMarkingLog> {
    const result = await db.insert(productMarkingLogs).values(log).returning();
    return result[0];
  }

  async getMarkingLogsByOrder(orderId: string): Promise<ProductMarkingLog[]> {
    const results = await db
      .select()
      .from(productMarkingLogs)
      .where(eq(productMarkingLogs.orderId, orderId))
      .orderBy(asc(productMarkingLogs.scannedAt));
    return results;
  }

  async getMarkingLogsByProduct(productId: string): Promise<ProductMarkingLog[]> {
    const results = await db
      .select()
      .from(productMarkingLogs)
      .where(eq(productMarkingLogs.productId, productId))
      .orderBy(desc(productMarkingLogs.scannedAt));
    return results;
  }

  async isMarkingCodeUsed(markingCode: string): Promise<boolean> {
    const result = await db
      .select()
      .from(productMarkingLogs)
      .where(eq(productMarkingLogs.markingCode, markingCode));
    return result.length > 0;
  }

  async getMarkingLogByCode(markingCode: string): Promise<ProductMarkingLog | undefined> {
    const result = await db
      .select()
      .from(productMarkingLogs)
      .where(eq(productMarkingLogs.markingCode, markingCode));
    return result[0];
  }

  async deleteMarkingLog(logId: string): Promise<void> {
    await db
      .delete(productMarkingLogs)
      .where(eq(productMarkingLogs.id, logId));
  }

  // Order Points (Yandex integration)
  async createOrderPoint(point: InsertOrderPoint): Promise<OrderPoint> {
    const result = await db
      .insert(orderPoints)
      .values(point)
      .returning();
    return result[0]!;
  }

  async getOrderPoints(orderId: string): Promise<OrderPoint[]> {
    return await db
      .select()
      .from(orderPoints)
      .where(eq(orderPoints.orderId, orderId))
      .orderBy(asc(orderPoints.pointId));
  }

  async deleteOrderPoints(orderId: string): Promise<void> {
    await db
      .delete(orderPoints)
      .where(eq(orderPoints.orderId, orderId));
  }

  // Webhook Events
  async createWebhookEvent(event: InsertWebhookEvent): Promise<WebhookEvent> {
    const result = await db
      .insert(webhookEvents)
      .values(event)
      .returning();
    return result[0]!;
  }

  async getWebhookEvents(filters?: { orderId?: string; source?: string; processed?: boolean; limit?: number }): Promise<WebhookEvent[]> {
    let query = db.select().from(webhookEvents);

    const conditions: any[] = [];
    if (filters?.orderId) {
      conditions.push(eq(webhookEvents.orderId, filters.orderId));
    }
    if (filters?.source) {
      conditions.push(eq(webhookEvents.source, filters.source));
    }
    if (filters?.processed !== undefined) {
      conditions.push(eq(webhookEvents.processed, filters.processed));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    query = query.orderBy(desc(webhookEvents.createdAt));

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    return await query;
  }

  async markWebhookEventAsProcessed(id: string, error?: string): Promise<WebhookEvent | undefined> {
    const result = await db
      .update(webhookEvents)
      .set({ 
        processed: true, 
        processingError: error || null,
        processedAt: new Date()
      })
      .where(eq(webhookEvents.id, id))
      .returning();
    return result[0];
  }

  // Courier Tracking
  async createCourierTracking(tracking: InsertCourierTracking): Promise<CourierTracking> {
    const result = await db
      .insert(courierTracking)
      .values(tracking)
      .returning();
    return result[0]!;
  }

  async getCourierTracking(orderId: string, limit: number = 50): Promise<CourierTracking[]> {
    return await db
      .select()
      .from(courierTracking)
      .where(eq(courierTracking.orderId, orderId))
      .orderBy(desc(courierTracking.reportedAt))
      .limit(limit);
  }

  async getLatestCourierPosition(orderId: string): Promise<CourierTracking | undefined> {
    const result = await db
      .select()
      .from(courierTracking)
      .where(eq(courierTracking.orderId, orderId))
      .orderBy(desc(courierTracking.reportedAt))
      .limit(1);
    return result[0];
  }
}

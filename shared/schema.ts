import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Пользователи (Telegram users)
export const users = pgTable("users", {
  id: varchar("id").primaryKey(), // Telegram user ID
  username: text("username"),
  firstName: text("first_name"),
  lastName: text("last_name"),
});

export const insertUserSchema = createInsertSchema(users);
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Администраторы (whitelist)
export const admins = pgTable("admins", {
  userId: varchar("user_id").primaryKey(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAdminSchema = createInsertSchema(admins).omit({ createdAt: true });
export type InsertAdmin = z.infer<typeof insertAdminSchema>;
export type Admin = typeof admins.$inferSelect;

// Категории (3-уровневая иерархия через parentId)
export const categories = pgTable("categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  parentId: varchar("parent_id"),
  sortOrder: integer("sort_order").default(0),
});

export const insertCategorySchema = createInsertSchema(categories).omit({ id: true });
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categories.$inferSelect;

// Продукты
export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  categoryId: varchar("category_id").notNull().references(() => categories.id),
  images: text("images").array().notNull().default(sql`ARRAY[]::text[]`),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  priceOld: decimal("price_old", { precision: 10, scale: 2 }),
  unit: text("unit").notNull().default('кг'),
  inStock: boolean("in_stock").notNull().default(true),
  
  // Вариации вкуса
  tasteVariations: text("taste_variations").array().notNull().default(sql`ARRAY[]::text[]`),
  
  // Статистика рейтинга вкуса
  tasteRatingStats: jsonb("taste_rating_stats").$type<{
    tasty: number;
    veryTasty: number;
    superTasty: number;
  }>().notNull().default({ tasty: 0, veryTasty: 0, superTasty: 0 }),
  
  // Описания
  descriptionShort: text("description_short"),
  descriptionFull: text("description_full"),
  
  // Питательная ценность
  nutrition: jsonb("nutrition").$type<{
    proteins: string;
    fats: string;
    carbs: string;
    calories: string;
    composition: string[];
    additionalInfo: string[];
  }>(),
});

export const insertProductSchema = createInsertSchema(products).omit({ id: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

// Корзина (одна на пользователя)
export const carts = pgTable("carts", {
  userId: varchar("user_id").primaryKey(),
  items: jsonb("items").$type<Array<{
    productId: string;
    quantity: number;
    priceAtAdd: string;
  }>>().notNull().default([]),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCartSchema = createInsertSchema(carts);
export type InsertCart = z.infer<typeof insertCartSchema>;
export type Cart = typeof carts.$inferSelect;

// Заказы
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  items: jsonb("items").$type<Array<{
    productId: string;
    productName: string;
    quantity: number;
    price: string;
    unit: string;
  }>>().notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  
  // Dati cliente per la consegna
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  customerEmail: text("customer_email").notNull(),
  
  // Indirizzo completo (backward compatibility)
  deliveryAddress: text("delivery_address").notNull(),
  
  // Indirizzo strutturato per integrazione logistica russa
  deliveryCity: text("delivery_city"),
  deliveryStreet: text("delivery_street"),
  deliveryBuilding: text("delivery_building"),
  deliveryFlat: text("delivery_flat"),
  deliveryPostalCode: text("delivery_postal_code"),
  dadataFiasId: text("dadata_fias_id"), // FIAS ID per riferimento ufficiale
  
  deliveryNotes: text("delivery_notes"),
  
  status: text("status").notNull().default('new'), // 'new' | 'pending_payment' | 'paid' | 'failed' | 'cancelled'
  paymentId: varchar("payment_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

// Токены вращений колеса фортуны
export const fortuneSpinTokens = pgTable("fortune_spin_tokens", {
  userId: varchar("user_id").primaryKey(),
  tokens: integer("tokens").notNull().default(3),
});

export const insertFortuneSpinTokensSchema = createInsertSchema(fortuneSpinTokens);
export type InsertFortuneSpinTokens = z.infer<typeof insertFortuneSpinTokensSchema>;
export type FortuneSpinTokens = typeof fortuneSpinTokens.$inferSelect;

// Призы
export const prizes = pgTable("prizes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'discount' | 'delivery_coupon' | 'gift'
  value: text("value").notNull(),
  claimed: boolean("claimed").notNull().default(false),
  claimedAt: timestamp("claimed_at"),
  orderId: varchar("order_id").references(() => orders.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPrizeSchema = createInsertSchema(prizes).omit({ id: true, createdAt: true });
export type InsertPrize = z.infer<typeof insertPrizeSchema>;
export type Prize = typeof prizes.$inferSelect;

// История вращений
export const spins = pgTable("spins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  prizeId: varchar("prize_id").notNull().references(() => prizes.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSpinSchema = createInsertSchema(spins).omit({ id: true, createdAt: true });
export type InsertSpin = z.infer<typeof insertSpinSchema>;
export type Spin = typeof spins.$inferSelect;

// Разговоры AI ассистента
export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true });
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;

// Сообщения
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id),
  role: text("role").notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// Бонусы (% от предыдущего заказа)
export const bonuses = pgTable("bonuses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  percentage: integer("percentage").notNull(), // 5, 10, или 15
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(), // Рассчитанная сумма бонуса
  fromOrderId: varchar("from_order_id").references(() => orders.id), // Заказ, из которого рассчитан бонус
  used: boolean("used").notNull().default(false),
  usedInOrderId: varchar("used_in_order_id").references(() => orders.id), // Заказ, в котором использован
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBonusSchema = createInsertSchema(bonuses).omit({ id: true, createdAt: true });
export type InsertBonus = z.infer<typeof insertBonusSchema>;
export type Bonus = typeof bonuses.$inferSelect;

// Платежные интенты
export const paymentIntents = pgTable("payment_intents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  provider: text("provider").notNull().default('SBP'),
  status: text("status").notNull().default('pending'), // 'pending' | 'completed' | 'failed'
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  redirectUrl: text("redirect_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  raw: jsonb("raw"), // Для хранения необработанных данных от провайдера
});

export const insertPaymentIntentSchema = createInsertSchema(paymentIntents).omit({ id: true, createdAt: true });
export type InsertPaymentIntent = z.infer<typeof insertPaymentIntentSchema>;
export type PaymentIntent = typeof paymentIntents.$inferSelect;

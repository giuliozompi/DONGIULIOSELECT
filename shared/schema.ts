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
  phone: text("phone"),
  email: text("email"),
  customerName: text("customer_name"), // Nome completo inserito dall'utente nel checkout
  
  // Indirizzo di consegna
  address: text("address"), // Via e numero civico
  city: text("city"), // Città
  building: text("building"), // Edificio/palazzo
  apartment: text("apartment"), // Numero appartamento
  addressNotes: text("address_notes"), // Note aggiuntive (citofono, piano, etc.)
});

export const insertUserSchema = createInsertSchema(users);
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Администраторы (whitelist)
export const admins = pgTable("admins", {
  userId: varchar("user_id").primaryKey(),
  telegramUsername: text("telegram_username"),
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
  image: text("image"), // URL изображения категории
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
  sortPriority: integer("sort_priority").notNull().default(0),
  
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
  
  // Маркировка (требование регулирования РФ)
  requiresMarking: boolean("requires_marking").notNull().default(false),
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
  
  // Sconto applicato dall'admin (importo fisso)
  discount: decimal("discount", { precision: 10, scale: 2 }).default('0'),
  discountType: text("discount_type"), // 'percentage' | 'fixed' | null
  discountValue: text("discount_value"), // Valore originale (es: "10%" o "500")
  
  // Dati cliente per la consegna
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  customerEmail: text("customer_email"),
  
  // Indirizzo completo normalizzato da DaData
  deliveryAddress: text("delivery_address").notNull(),
  
  // Metadati indirizzo per integrazione logistica e tracking
  deliveryPostalCode: text("delivery_postal_code"),
  dadataFiasId: text("dadata_fias_id"), // FIAS ID per riferimento ufficiale
  
  deliveryNotes: text("delivery_notes"),
  
  // Modalità di consegna
  deliveryMethod: text("delivery_method"), // 'yandex_go' | 'cdek' | 'don_giulio_courier' | 'pickup'
  
  // Stati ordine: ОФОРМЛЕН (confermato) | СОБРАН (preparato) | ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ (link inviato) | ОПЛАЧЕН (pagato) | ВЫЗВАН КУРЬЕР (corriere chiamato) | ПОЛУЧЕН (ricevuto)
  status: text("status").notNull().default('ОФОРМЛЕН'),
  
  // Metodo di pagamento: 'yookassa' | 'cash_on_delivery'
  paymentMethod: text("payment_method").notNull().default('yookassa'),
  
  paymentId: varchar("payment_id"),
  paymentLinkSentAt: timestamp("payment_link_sent_at"),
  
  // Gamification: traccia se i spin tokens sono stati assegnati per questo ordine
  spinTokensAwarded: boolean("spin_tokens_awarded").notNull().default(false),
  
  // Logistica
  courierService: text("courier_service"), // 'yandex_go' | 'manual' | altro
  courierOrderId: text("courier_order_id"), // ID ordine dal servizio di logistica
  courierTrackingUrl: text("courier_tracking_url"),
  courierCalledAt: timestamp("courier_called_at"),
  
  // Yandex Dostavka Delivery specifics
  yandexClaimId: text("yandex_claim_id"), // ID della richiesta Yandex Dostavka
  yandexDeliveryPrice: decimal("yandex_delivery_price", { precision: 10, scale: 2 }), // Prezzo delivery Yandex
  yandexDeliveryStatus: text("yandex_delivery_status"), // Status del delivery Yandex
  yandexPerformerInfo: jsonb("yandex_performer_info").$type<{
    courierName?: string;
    legalName?: string;
    carModel?: string;
    carNumber?: string;
  }>(), // Info sul corriere Yandex Dostavka
  
  // Yandex Go specifics (general delivery service)
  yandexGoClaimId: text("yandex_go_claim_id"), // ID della richiesta Yandex Go
  yandexGoPrice: decimal("yandex_go_price", { precision: 10, scale: 2 }), // Prezzo delivery Yandex Go
  yandexGoStatus: text("yandex_go_status"), // Status del delivery Yandex Go
  yandexGoPerformerInfo: jsonb("yandex_go_performer_info").$type<{
    courierName?: string;
    legalName?: string;
    carModel?: string;
    carNumber?: string;
  }>(), // Info sul corriere Yandex Go
  
  // Coordinate per Yandex Dostavka (pickup e delivery)
  pickupCoordinates: text("pickup_coordinates").array(), // [longitude, latitude]
  deliveryCoordinates: text("delivery_coordinates").array(), // [longitude, latitude]
  
  // Coordinate delivery in formato decimale (per facilità di utilizzo)
  deliveryLatitude: decimal("delivery_latitude", { precision: 10, scale: 7 }),
  deliveryLongitude: decimal("delivery_longitude", { precision: 10, scale: 7 }),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

// Order status constants
export const ORDER_STATUSES = {
  FORMED: 'ОФОРМЛЕН',
  PREPARED: 'СОБРАН',
  PAYMENT_LINK_SENT: 'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ',
  PAID: 'ОПЛАЧЕН',
  COURIER_CALLED: 'ВЫЗВАН КУРЬЕР',
  RECEIVED: 'ПОЛУЧЕН',
  DELETED: 'УДАЛЕНО', // Solo Master Admin può cancellare ordini
} as const;

// Stati che indicano che l'ordine è stato pagato (include stati post-pagamento)
export const PAID_ORDER_STATUSES = [
  ORDER_STATUSES.PAID,
  ORDER_STATUSES.COURIER_CALLED,
  ORDER_STATUSES.RECEIVED,
] as const;

// Delivery method constants
export const DELIVERY_METHODS = {
  YANDEX_GO: 'yandex_go',
  CDEK: 'cdek',
  DON_GIULIO_COURIER: 'don_giulio_courier',
  PICKUP: 'pickup',
} as const;

export const DELIVERY_METHOD_LABELS = {
  [DELIVERY_METHODS.YANDEX_GO]: 'Яндекс го (доставку оплачивается в приложение)',
  [DELIVERY_METHODS.CDEK]: 'Сдек (оплата доставку по России при получением)',
  [DELIVERY_METHODS.DON_GIULIO_COURIER]: 'Дон Джулио курьер (договариваетесь с менеджером)',
  [DELIVERY_METHODS.PICKUP]: 'Самовывоз (бесплатно)',
} as const;

// Payment method constants
export const PAYMENT_METHODS = {
  YOOKASSA: 'yookassa',
  CASH_ON_DELIVERY: 'cash_on_delivery',
} as const;

export const PAYMENT_METHOD_LABELS = {
  [PAYMENT_METHODS.YOOKASSA]: 'Онлайн оплата (ЮКасса)',
  [PAYMENT_METHODS.CASH_ON_DELIVERY]: 'Наличными при получении',
} as const;

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
  
  // Per premi di tipo 'gift': array di productId
  productIds: text("product_ids").array().default(sql`ARRAY[]::text[]`),
  
  claimed: boolean("claimed").notNull().default(false),
  claimedAt: timestamp("claimed_at"),
  orderId: varchar("order_id").references(() => orders.id),
  
  // Admin che ha aggiunto il premio al carrello (per premi gift)
  adminUsedBy: varchar("admin_used_by"),
  
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

// Indirizzi salvati degli utenti
export const userAddresses = pgTable("user_addresses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  label: text("label").notNull(), // es: "Casa", "Ufficio", "Dacha"
  
  // Indirizzo completo
  fullAddress: text("full_address").notNull(),
  
  // Indirizzo strutturato
  city: text("city"),
  street: text("street"),
  building: text("building"),
  flat: text("flat"),
  postalCode: text("postal_code"),
  dadataFiasId: text("dadata_fias_id"),
  
  // Coordinate geografiche (da DaData)
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  
  // Telefono contatto per questo indirizzo
  phone: text("phone"),
  
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserAddressSchema = createInsertSchema(userAddresses).omit({ id: true, createdAt: true });
export type InsertUserAddress = z.infer<typeof insertUserAddressSchema>;
export type UserAddress = typeof userAddresses.$inferSelect;

// Indirizzi di pick-up (ritiro) per consegne
export const pickupAddresses = pgTable("pickup_addresses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  label: text("label").notNull(), // es: "Magazzino principale", "Sede Don Giulio"
  
  // Indirizzo completo
  fullAddress: text("full_address").notNull(),
  
  // Indirizzo strutturato
  city: text("city"),
  street: text("street"),
  building: text("building"),
  flat: text("flat"),
  postalCode: text("postal_code"),
  dadataFiasId: text("dadata_fias_id"),
  
  // Coordinate geografiche (richieste da Yandex Dostavka)
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  
  // Contatto per il pick-up
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPickupAddressSchema = createInsertSchema(pickupAddresses).omit({ id: true, createdAt: true }).extend({
  contactPhone: z.string().regex(/^[0-9 \(\)\-\+]*$/, 'Invalid phone format').optional().or(z.literal('')),
});
export type InsertPickupAddress = z.infer<typeof insertPickupAddressSchema>;
export type PickupAddress = typeof pickupAddresses.$inferSelect;

// Log delle modifiche agli ordini (per contestazioni)
export const orderChangeLogs = pgTable("order_change_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  adminUserId: varchar("admin_user_id"), // Admin che ha fatto la modifica (null per webhook automatici)
  changeType: text("change_type").notNull(), // 'quantity_changed' | 'product_added' | 'product_removed' | 'product_replaced' | 'discount_applied' | 'address_changed'
  
  // Dati della modifica in formato strutturato
  changeData: jsonb("change_data").$type<{
    // Per quantity_changed
    productId?: string;
    productName?: string;
    oldQuantity?: number;
    newQuantity?: number;
    
    // Per product_added
    addedProductId?: string;
    addedProductName?: string;
    addedQuantity?: number;
    addedPrice?: string;
    
    // Per product_removed
    removedProductId?: string;
    removedProductName?: string;
    
    // Per product_replaced
    oldProductId?: string;
    oldProductName?: string;
    newProductId?: string;
    newProductName?: string;
    replacementQuantity?: number;
    replacementPrice?: string;
    
    // Per discount_applied
    discountType?: string; // 'percentage' | 'fixed'
    discountValue?: string;
    oldAmount?: string;
    newAmount?: string;
    
    // Per address_changed
    oldAddress?: string;
    newAddress?: string;
    
    // Per Yandex delivery integration (yandex_go_created, yandex_dostavka_created, etc)
    savedToCustomer?: boolean;
    claimId?: string;
    status?: string;
    price?: string;
    oldOrderStatus?: string;
    newOrderStatus?: string;
    oldDeliveryStatus?: string | null;
    newDeliveryStatus?: string;
    cancelledDeliveryStatus?: string;
    yandexGoClaimId?: string;
    yandexDostavkaClaimId?: string;
    yandexClaimId?: string;
    deliveryPrice?: string;
    performerInfo?: any;
    cancelInfo?: any;
    
    // Per yandex webhook status updates
    event?: string;
    oldStatus?: string;
    newStatus?: string;
    timestamp?: string | number;
    location?: any;
    eta?: any;
    
    // Note dell'admin
    notes?: string;
  }>().notNull(),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOrderChangeLogSchema = createInsertSchema(orderChangeLogs).omit({ id: true, createdAt: true });
export type InsertOrderChangeLog = z.infer<typeof insertOrderChangeLogSchema>;
export type OrderChangeLog = typeof orderChangeLogs.$inferSelect;

// Associazioni prodotti (raccomandazioni)
export const productAssociations = pgTable("product_associations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceProductId: varchar("source_product_id").notNull().references(() => products.id),
  targetProductId: varchar("target_product_id").notNull().references(() => products.id),
  reason: text("reason"), // Descrizione perché associare (es: "Si abbina perfettamente")
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProductAssociationSchema = createInsertSchema(productAssociations).omit({ id: true, createdAt: true });
export type InsertProductAssociation = z.infer<typeof insertProductAssociationSchema>;
export type ProductAssociation = typeof productAssociations.$inferSelect;

// Log delle azioni amministrative (per audit trail)
export const adminActionLogs = pgTable("admin_action_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminUserId: varchar("admin_user_id").notNull(), // Admin che ha fatto l'azione
  telegramUsername: text("telegram_username"), // Username Telegram dell'admin
  
  actionType: text("action_type").notNull(), // 'created' | 'updated' | 'deleted'
  entityType: text("entity_type").notNull(), // 'category' | 'product' | 'product_association' | 'admin'
  entityId: varchar("entity_id"), // ID dell'entità modificata (null per alcune azioni)
  
  // Dati dell'azione in formato strutturato
  actionData: jsonb("action_data").$type<{
    // Per categorie
    categoryName?: string;
    categorySlug?: string;
    oldData?: any;
    newData?: any;
    
    // Per prodotti
    productName?: string;
    productSlug?: string;
    
    // Per associazioni
    sourceProductName?: string;
    targetProductName?: string;
    
    // Per admin
    affectedUserId?: string;
    affectedUsername?: string;
    
    // Per delete operations
    deletedOrder?: any;
    logId?: string;
    deletedAddress?: any;
    reason?: string;
    
    // Note generali
    notes?: string;
  }>().notNull().default({}),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAdminActionLogSchema = createInsertSchema(adminActionLogs).omit({ id: true, createdAt: true });
export type InsertAdminActionLog = z.infer<typeof insertAdminActionLogSchema>;
export type AdminActionLog = typeof adminActionLogs.$inferSelect;

// Log маркировки продуктов (Product marking codes for regulatory compliance)
export const productMarkingLogs = pgTable("product_marking_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").notNull().references(() => products.id),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  
  // Codice di marcatura acquisito
  markingCode: text("marking_code").notNull().unique(), // Codice univoco scansionato
  
  // Info operatore che ha acquisito il codice
  operatorId: varchar("operator_id").notNull(), // ID dell'admin/operatore
  operatorUsername: text("operator_username"), // Username Telegram dell'operatore
  
  // Timestamp acquisizione
  scannedAt: timestamp("scanned_at").notNull().defaultNow(),
  
  // Data ordine (duplicato per query veloci)
  orderDate: timestamp("order_date").notNull(),
});

export const insertProductMarkingLogSchema = createInsertSchema(productMarkingLogs).omit({ id: true, scannedAt: true });
export type InsertProductMarkingLog = z.infer<typeof insertProductMarkingLogSchema>;
export type ProductMarkingLog = typeof productMarkingLogs.$inferSelect;

// Order points (pickup and delivery locations for Yandex integration)
export const orderPoints = pgTable("order_points", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: 'cascade' }),
  
  pointId: integer("point_id").notNull(), // Sequence number (1, 2, 3...)
  type: text("type").notNull(), // 'source' (pickup) | 'destination' (delivery)
  
  // Address
  fullAddress: text("full_address").notNull(),
  city: text("city"),
  street: text("street"),
  building: text("building"),
  flat: text("flat"),
  porch: text("porch"),
  floor: text("floor"),
  
  // Coordinates
  latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
  longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
  
  // Contact info
  contactName: text("contact_name").notNull(),
  contactPhone: text("contact_phone").notNull(),
  contactEmail: text("contact_email"),
  
  // Instructions and time window
  comment: text("comment"), // Istruzioni per il corriere
  timeWindowFrom: timestamp("time_window_from"), // Inizio finestra oraria
  timeWindowTo: timestamp("time_window_to"), // Fine finestra oraria
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOrderPointSchema = createInsertSchema(orderPoints).omit({ id: true, createdAt: true });
export type InsertOrderPoint = z.infer<typeof insertOrderPointSchema>;
export type OrderPoint = typeof orderPoints.$inferSelect;

// Webhook events from Yandex (audit trail for all webhook calls)
export const webhookEvents = pgTable("webhook_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").references(() => orders.id, { onDelete: 'set null' }), // Nullable per eventi senza orderId
  
  source: text("source").notNull(), // 'yandex_go' | 'yandex_dostavka' | 'yookassa' | etc.
  eventType: text("event_type").notNull(), // 'status_changed' | 'courier_assigned' | etc.
  
  // Raw payload from webhook
  payloadJson: jsonb("payload_json").notNull(),
  
  // Status tracking
  processed: boolean("processed").notNull().default(false),
  processingError: text("processing_error"), // Error message se processing fallisce
  
  // HTTP info
  httpMethod: text("http_method"), // POST, GET, etc.
  httpHeaders: jsonb("http_headers"), // Request headers
  signature: text("signature"), // HMAC signature se presente
  signatureValid: boolean("signature_valid"), // true/false/null
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  processedAt: timestamp("processed_at"),
});

export const insertWebhookEventSchema = createInsertSchema(webhookEvents).omit({ id: true, createdAt: true, processedAt: true });
export type InsertWebhookEvent = z.infer<typeof insertWebhookEventSchema>;
export type WebhookEvent = typeof webhookEvents.$inferSelect;

// Courier tracking (real-time location updates from Yandex)
export const courierTracking = pgTable("courier_tracking", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: 'cascade' }),
  
  // Courier position
  latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
  longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
  
  // Movement data
  heading: decimal("heading", { precision: 5, scale: 2 }), // Direzione in gradi (0-360)
  speed: decimal("speed", { precision: 5, scale: 2 }), // Velocità in km/h
  
  // ETA
  etaMinutes: integer("eta_minutes"), // Tempo stimato di arrivo in minuti
  
  // Timestamp from provider
  reportedAt: timestamp("reported_at").notNull(), // Quando il corriere ha inviato la posizione
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCourierTrackingSchema = createInsertSchema(courierTracking).omit({ id: true, createdAt: true });
export type InsertCourierTracking = z.infer<typeof insertCourierTrackingSchema>;
export type CourierTracking = typeof courierTracking.$inferSelect;

// Prodotti preferiti (favorites)
export const favoriteProducts = pgTable("favorite_products", {
  userId: varchar("user_id").notNull().references(() => users.id),
  productId: varchar("product_id").notNull().references(() => products.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  pk: sql`PRIMARY KEY (${table.userId}, ${table.productId})`,
}));

export const insertFavoriteProductSchema = createInsertSchema(favoriteProducts).omit({ createdAt: true });
export type InsertFavoriteProduct = z.infer<typeof insertFavoriteProductSchema>;
export type FavoriteProduct = typeof favoriteProducts.$inferSelect;

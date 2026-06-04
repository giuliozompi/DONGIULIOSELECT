import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, boolean, timestamp, jsonb, date } from "drizzle-orm/pg-core";
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
  isVisible: boolean("is_visible").notNull().default(true), // Visibilità nel frontend cliente (solo Master Admin)
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
  
  // Visibilità nel frontend cliente (solo Master Admin può modificare)
  isVisible: boolean("is_visible").notNull().default(true),
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
  
  // Sistema anti-gaming per notifiche carrello abbandonato (max 2 reminder)
  nextReminderCheckAt: timestamp("next_reminder_check_at", { withTimezone: true }), // Timestamp RANDOM per prossimo check
  reminderCount: integer("reminder_count").notNull().default(0), // 0, 1, o 2 (max 2 reminder)
});

export const insertCartSchema = createInsertSchema(carts);
export type InsertCart = z.infer<typeof insertCartSchema>;
export type Cart = typeof carts.$inferSelect & {
  activeDiscount?: {
    discountCode: string;
    discountPercent: number;
    expiresAt: Date;
  };
};

// Notifiche carrello abbandonato (anti-gaming con delay e sconto random)
export const abandonedCartNotifications = pgTable("abandoned_cart_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  
  // Snapshot del carrello al momento dell'invio (per tracking)
  cartSnapshot: jsonb("cart_snapshot").$type<Array<{
    productId: string;
    productName: string;
    quantity: number;
    priceAtAdd: string;
  }>>().notNull(),
  
  // Sconto RANDOM 5-10% (non cumulabile)
  discountPercent: integer("discount_percent").notNull(), // 5, 6, 7, 8, 9, o 10
  discountCode: varchar("discount_code").notNull().unique(), // Codice univoco (es: CART7-ABC123)
  
  // Numero reminder (1 o 2) per tracking notifiche sequenziali
  reminderNumber: integer("reminder_number").notNull().default(1), // 1ª o 2ª notifica
  
  // Canale notifica
  channel: text("channel").notNull(), // 'telegram' | 'email'
  
  // Validità sconto: 24h dalla ricezione
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), // sentAt + 24h
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
  
  // Status tracking
  status: text("status").notNull().default('sent'), // 'sent' | 'used' | 'expired' | 'failed'
  usedInOrderId: varchar("used_in_order_id").references(() => orders.id), // Ordine dove è stato usato
  
  // Error handling
  error: text("error"), // Messaggio errore se invio fallito
  retryCount: integer("retry_count").notNull().default(0),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAbandonedCartNotificationSchema = createInsertSchema(abandonedCartNotifications).omit({ 
  id: true, 
  createdAt: true 
});
export type InsertAbandonedCartNotification = z.infer<typeof insertAbandonedCartNotificationSchema>;
export type AbandonedCartNotification = typeof abandonedCartNotifications.$inferSelect;

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
  
  // Scontrino fiscale (54-ФЗ) - dati da YooKassa
  receiptId: varchar("receipt_id"), // ID dello scontrino da YooKassa
  receiptUrl: text("receipt_url"), // URL per scaricare lo scontrino
  receiptStatus: text("receipt_status"), // 'pending' | 'succeeded' | 'canceled'
  fiscalData: jsonb("fiscal_data").$type<{
    fiscal_document_number?: string; // Номер фискального документа
    fiscal_storage_number?: string; // Номер фискального накопителя
    fiscal_attribute?: string; // Фискальный признак документа
    registered_at?: string; // Data registrazione scontrino
  }>(), // Dati fiscali completi dello scontrino
  
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
  yandexDeliveryOfferId: text("yandex_delivery_offer_id"), // Offer ID/payload da checkPrice (necessario per createClaim)
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
  yandexGoOfferId: text("yandex_go_offer_id"), // Offer ID/payload da checkPrice (necessario per createClaim)
  yandexGoStatus: text("yandex_go_status"), // Status del delivery Yandex Go
  yandexGoPerformerInfo: jsonb("yandex_go_performer_info").$type<{
    courierName?: string;
    legalName?: string;
    carModel?: string;
    carNumber?: string;
  }>(), // Info sul corriere Yandex Go
  
  // CDEK (СДЭК) Delivery specifics
  cdekOrderUuid: text("cdek_order_uuid"), // UUID dell'ordine CDEK
  cdekOrderNumber: text("cdek_order_number"), // Numero ordine interno CDEK
  cdekTrackingNumber: text("cdek_tracking_number"), // Numero di tracciamento (barcode)
  cdekDispatchNumber: text("cdek_dispatch_number"), // Numero spedizione CDEK
  cdekPrice: decimal("cdek_price", { precision: 10, scale: 2 }), // Prezzo consegna CDEK
  cdekTariffCode: integer("cdek_tariff_code"), // Codice tariffa CDEK usata
  cdekTariffName: text("cdek_tariff_name"), // Nome della tariffa (es: "Посылка склад-склад")
  cdekDeliveryMode: text("cdek_delivery_mode"), // 'door' | 'office' | 'postamat'
  cdekPvzCode: text("cdek_pvz_code"), // Codice punto ritiro se scelto
  cdekPvzAddress: text("cdek_pvz_address"), // Indirizzo punto ritiro
  cdekCityCode: integer("cdek_city_code"), // Codice città CDEK per creazione ordine
  cdekStatus: text("cdek_status"), // Status dell'ordine CDEK
  cdekStatusDate: timestamp("cdek_status_date"), // Data ultimo aggiornamento status
  cdekEstimatedDelivery: timestamp("cdek_estimated_delivery"), // Data consegna stimata
  cdekActualDelivery: timestamp("cdek_actual_delivery"), // Data consegna effettiva
  
  // Coordinate per Yandex Dostavka (pickup e delivery)
  pickupCoordinates: text("pickup_coordinates").array(), // [longitude, latitude]
  deliveryCoordinates: text("delivery_coordinates").array(), // [longitude, latitude]
  
  // Coordinate delivery in formato decimale (per facilità di utilizzo)
  deliveryLatitude: decimal("delivery_latitude", { precision: 10, scale: 7 }),
  deliveryLongitude: decimal("delivery_longitude", { precision: 10, scale: 7 }),
  
  // Costo spedizione e pagamento
  deliveryCost: decimal("delivery_cost", { precision: 10, scale: 2 }), // Costo della spedizione (salvato per uso futuro)
  customerPaysShipping: boolean("customer_pays_shipping").notNull().default(true), // Se true, il cliente paga la spedizione al corriere
  shippingPaymentMethod: text("shipping_payment_method"), // 'card' | 'cash' - metodo di pagamento per la spedizione
  
  // Refund (Rimborso)
  refundId: varchar("refund_id"), // ID del rimborso YooKassa
  refundStatus: text("refund_status"), // 'pending' | 'succeeded' | 'canceled'
  refundReason: text("refund_reason"), // Motivazione inserita dall'operatore
  refundedAmount: decimal("refunded_amount", { precision: 10, scale: 2 }), // Importo rimborsato
  refundedAt: timestamp("refunded_at"), // Data e ora del rimborso
  
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
  REFUNDED: 'ВОЗВРАТ', // Ordine rimborsato tramite YooKassa
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
  [DELIVERY_METHODS.YANDEX_GO]: 'Яндекс го (доставки оплачивается в приложение)',
  [DELIVERY_METHODS.CDEK]: 'Сдек (оплата доставки по России при получением)',
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
    
    // Per shipping_settings_changed
    customerPaysShipping?: boolean;
    shippingPaymentMethod?: 'card' | 'cash';
    
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
    
    // Per CDEK delivery integration
    cdekOrderUuid?: string;
    cdekOrderNumber?: string;
    tariffCode?: number;
    deliveryMode?: string;
    pvzCode?: string;
    previousStatus?: string;
    statusName?: string;
    
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
    
    // Per visibility toggle (Master Admin only)
    oldVisibility?: boolean;
    newVisibility?: boolean;
    
    // Note generali
    notes?: string;
  }>().notNull().default({}),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAdminActionLogSchema = createInsertSchema(adminActionLogs).omit({ id: true, createdAt: true });
export type InsertAdminActionLog = typeof adminActionLogs.$inferInsert;
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

// CDEK Pickup Points (PVZ) - Cached list of delivery points
export const cdekPickupPoints = pgTable("cdek_pickup_points", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // CDEK identifiers
  code: text("code").notNull().unique(), // Codice unico punto CDEK (es: "MSK123")
  name: text("name").notNull(), // Nome del punto (es: "СДЭК Москва-Центр")
  type: text("type").notNull(), // 'PVZ' | 'POSTAMAT' (punto ritiro / постамат)
  
  // Location
  city: text("city").notNull(),
  cityCode: integer("city_code"), // Codice città CDEK
  postalCode: text("postal_code"),
  countryCode: text("country_code").notNull().default('RU'),
  region: text("region"),
  regionCode: integer("region_code"),
  
  // Address
  addressFull: text("address_full").notNull(), // Indirizzo completo
  addressShort: text("address_short"), // Indirizzo breve
  
  // Coordinates
  latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
  longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
  
  // Work schedule
  workTime: text("work_time"), // es: "Пн-Пт 09:00-21:00, Сб-Вс 10:00-18:00"
  workTimeList: jsonb("work_time_list").$type<Array<{
    day: number; // 1-7 (Mon-Sun)
    time: string; // "09:00/21:00"
  }>>(),
  
  // Features
  isHandout: boolean("is_handout").notNull().default(true), // Выдача заказов
  isReception: boolean("is_reception").notNull().default(false), // Прием посылок
  isDressingRoom: boolean("is_dressing_room").notNull().default(false), // Примерочная
  haveCashless: boolean("have_cashless").notNull().default(false), // Безналичный расчет
  haveCash: boolean("have_cash").notNull().default(false), // Наличный расчет
  allowedCod: boolean("allowed_cod").notNull().default(false), // Наложенный платеж
  
  // Weight limits
  weightMin: decimal("weight_min", { precision: 8, scale: 3 }), // Min weight in kg
  weightMax: decimal("weight_max", { precision: 8, scale: 3 }), // Max weight in kg
  
  // Contact
  phone: text("phone"),
  email: text("email"),
  note: text("note"), // Istruzioni aggiuntive
  
  // Metro stations (for Moscow/SPB)
  nearestMetroStation: text("nearest_metro_station"),
  metroStationColor: text("metro_station_color"), // Colore linea metro
  
  // Dimensions limits (for packages)
  dimensionsMin: jsonb("dimensions_min").$type<{ width: number; height: number; depth: number }>(),
  dimensionsMax: jsonb("dimensions_max").$type<{ width: number; height: number; depth: number }>(),
  
  // Images
  images: text("images").array(), // Array of image URLs
  
  // Active status
  isActive: boolean("is_active").notNull().default(true),
  
  // Cache timestamps
  lastSyncedAt: timestamp("last_synced_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCdekPickupPointSchema = createInsertSchema(cdekPickupPoints).omit({ id: true, createdAt: true, lastSyncedAt: true });
export type InsertCdekPickupPoint = z.infer<typeof insertCdekPickupPointSchema>;
export type CdekPickupPoint = typeof cdekPickupPoints.$inferSelect;

// CDEK Tariffs cache (optional - for quick tariff lookups)
export const cdekTariffs = pgTable("cdek_tariffs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  tariffCode: integer("tariff_code").notNull().unique(), // Codice tariffa CDEK
  tariffName: text("tariff_name").notNull(), // Nome tariffa
  tariffDescription: text("tariff_description"), // Descrizione
  
  deliveryMode: text("delivery_mode").notNull(), // 'door' | 'office' | 'postamat'
  deliveryType: text("delivery_type").notNull(), // 'parcel' | 'cargo' | 'document'
  
  // Time estimates
  minDays: integer("min_days"), // Tempo minimo consegna
  maxDays: integer("max_days"), // Tempo massimo consegna
  
  isActive: boolean("is_active").notNull().default(true),
  lastSyncedAt: timestamp("last_synced_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCdekTariffSchema = createInsertSchema(cdekTariffs).omit({ id: true, createdAt: true, lastSyncedAt: true });
export type InsertCdekTariff = z.infer<typeof insertCdekTariffSchema>;
export type CdekTariff = typeof cdekTariffs.$inferSelect;

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

// Analytics snapshots (cache giornaliero per metriche - timezone Europe/Moscow)
export const analyticsSnapshots = pgTable("analytics_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  snapshotDate: date("snapshot_date").notNull(), // DATE (Moscow timezone, normalized in ETL)
  granularity: text("granularity").notNull().default('daily'), // 'daily' | 'weekly' | 'monthly'
  
  // Metriche ordini base
  totalOrders: integer("total_orders").notNull().default(0),
  completedOrders: integer("completed_orders").notNull().default(0), // ПОЛУЧЕН status
  paidOrders: integer("paid_orders").notNull().default(0), // ОПЛАЧЕН + post-payment
  pendingOrders: integer("pending_orders").notNull().default(0), // ОФОРМЛЕН status
  canceledOrders: integer("canceled_orders").notNull().default(0), // УДАЛЕНО status
  
  // Revenue tracking (raw inputs)
  grossRevenue: decimal("gross_revenue", { precision: 12, scale: 2 }).notNull().default('0'), // Total amount before discounts/refunds
  totalDiscounts: decimal("total_discounts", { precision: 12, scale: 2 }).notNull().default('0'),
  totalRefunds: decimal("total_refunds", { precision: 12, scale: 2 }).notNull().default('0'),
  netRevenue: decimal("net_revenue", { precision: 12, scale: 2 }).notNull().default('0'), // gross - discounts - refunds
  
  // Delivery & Shipping (revenue and cost)
  shippingRevenue: decimal("shipping_revenue", { precision: 10, scale: 2 }).notNull().default('0'),
  shippingCost: decimal("shipping_cost", { precision: 10, scale: 2 }).notNull().default('0'),
  
  // Cost of Goods Sold (per calcolare gross margin)
  cogs: decimal("cogs", { precision: 12, scale: 2 }).notNull().default('0'),
  
  // Metriche clienti
  newCustomers: integer("new_customers").notNull().default(0),
  returningCustomers: integer("returning_customers").notNull().default(0),
  totalCustomers: integer("total_customers").notNull().default(0),
  
  // Carrelli abbandonati
  abandonedCarts: integer("abandoned_carts").notNull().default(0),
  cartRemindersSent: integer("cart_reminders_sent").notNull().default(0),
  cartRecoveryOrders: integer("cart_recovery_orders").notNull().default(0), // Ordini da notifiche
  
  // Payment methods breakdown
  yookassaOrders: integer("yookassa_orders").notNull().default(0),
  cashOrders: integer("cash_orders").notNull().default(0),
  
  // Derivate metrics (cached for performance, ma ricalcolabili)
  averageOrderValue: decimal("average_order_value", { precision: 10, scale: 2 }).notNull().default('0'),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  // Composite unique constraint per supportare multiple granularit\u00e0
  uniqueSnapshotDateGranularity: sql`UNIQUE (${table.snapshotDate}, ${table.granularity})`,
  // Index per query performance
  snapshotDateGranularityIdx: sql`CREATE INDEX IF NOT EXISTS snapshot_date_granularity_idx ON ${table} (${table.snapshotDate}, ${table.granularity})`,
}));

export const insertAnalyticsSnapshotSchema = createInsertSchema(analyticsSnapshots).omit({ 
  id: true, 
  createdAt: true,
  updatedAt: true 
});
export type InsertAnalyticsSnapshot = z.infer<typeof insertAnalyticsSnapshotSchema>;
export type AnalyticsSnapshot = typeof analyticsSnapshots.$inferSelect;

// Top products per snapshot (per grafici "prodotti più venduti")
export const analyticsTopProducts = pgTable("analytics_top_products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  snapshotId: varchar("snapshot_id").notNull().references(() => analyticsSnapshots.id, { onDelete: 'cascade' }),
  snapshotDate: date("snapshot_date").notNull(), // DATE (denormalized per query performance)
  productId: varchar("product_id").notNull().references(() => products.id),
  productName: text("product_name").notNull(),
  
  unitsSold: decimal("units_sold", { precision: 10, scale: 3 }).notNull().default('0'),
  revenue: decimal("revenue", { precision: 10, scale: 2 }).notNull().default('0'),
  rank: integer("rank").notNull(), // 1 = best seller
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  // Unique constraint: un prodotto appare solo una volta per snapshot (supporta multiple granularità)
  uniqueSnapshotIdProduct: sql`UNIQUE (${table.snapshotId}, ${table.productId})`,
  // Indexes per query performance
  snapshotDateRankIdx: sql`CREATE INDEX IF NOT EXISTS snapshot_date_rank_idx ON ${table} (${table.snapshotDate}, ${table.rank})`,
  snapshotIdProductIdx: sql`CREATE INDEX IF NOT EXISTS snapshot_id_product_idx ON ${table} (${table.snapshotId}, ${table.productId})`,
}));

export const insertAnalyticsTopProductSchema = createInsertSchema(analyticsTopProducts).omit({ 
  id: true, 
  createdAt: true 
});
export type InsertAnalyticsTopProduct = z.infer<typeof insertAnalyticsTopProductSchema>;
export type AnalyticsTopProduct = typeof analyticsTopProducts.$inferSelect;

// Marketing Settings (single-row config per abandoned cart system)
export const marketingSettings = pgTable("marketing_settings", {
  id: integer("id").primaryKey(), // Single-row config (always id=1)
  enableAbandonedCartReminders: boolean("enable_abandoned_cart_reminders").notNull().default(true),
  minDelayHours: integer("min_delay_hours").notNull().default(20),
  maxDelayHours: integer("max_delay_hours").notNull().default(36),
  minDiscountPercent: integer("min_discount_percent").notNull().default(5),
  maxDiscountPercent: integer("max_discount_percent").notNull().default(10),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  // Enforce single-row constraint
  checkSingleRow: sql`CHECK (${table.id} = 1)`,
  // Enforce min < max constraints
  checkDelayHours: sql`CHECK (${table.minDelayHours} < ${table.maxDelayHours})`,
  checkDiscountPercent: sql`CHECK (${table.minDiscountPercent} < ${table.maxDiscountPercent} AND ${table.maxDiscountPercent} <= 100)`,
}));

export const insertMarketingSettingsSchema = createInsertSchema(marketingSettings).omit({ 
  id: true,
  updatedAt: true 
}).refine(
  (data) => data.minDelayHours < data.maxDelayHours,
  { message: "minDelayHours must be less than maxDelayHours" }
).refine(
  (data) => data.minDiscountPercent < data.maxDiscountPercent,
  { message: "minDiscountPercent must be less than maxDiscountPercent" }
).refine(
  (data) => data.maxDiscountPercent <= 100,
  { message: "maxDiscountPercent must be <= 100" }
);
export type InsertMarketingSettings = z.infer<typeof insertMarketingSettingsSchema>;
export type MarketingSettings = typeof marketingSettings.$inferSelect;

// Log notifiche ordine (ordine creato, pagato, cambio stato, link pagamento)
export const orderNotificationLogs = pgTable("order_notification_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  event: text("event").notNull(),     // 'order_created' | 'order_paid' | 'status_change' | 'payment_link'
  channel: text("channel").notNull(), // 'telegram' | 'email' | 'whatsapp'
  recipient: text("recipient").notNull(), // 'customer' | 'managers'
  userId: varchar("user_id"),
  orderId: varchar("order_id"),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  status: text("status").notNull().default('sent'), // 'sent' | 'failed'
  details: text("details"), // e.g. new status value, amount
  sentAt: timestamp("sent_at").notNull().defaultNow(),
});

export const insertOrderNotificationLogSchema = createInsertSchema(orderNotificationLogs).omit({ id: true, sentAt: true });
export type InsertOrderNotificationLog = z.infer<typeof insertOrderNotificationLogSchema>;
export type OrderNotificationLog = typeof orderNotificationLogs.$inferSelect;

// Notifiche di re-engagement (clienti inattivi da 21+ giorni)
export const reengagementNotifications = pgTable("reengagement_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
  status: text("status").notNull().default('sent'), // 'sent' | 'failed'
  telegramSent: boolean("telegram_sent").notNull().default(false),
  emailSent: boolean("email_sent").notNull().default(false),
  error: text("error"),
  daysSinceLastOrder: integer("days_since_last_order"),
});

export const insertReengagementNotificationSchema = createInsertSchema(reengagementNotifications).omit({ id: true, sentAt: true });
export type InsertReengagementNotification = z.infer<typeof insertReengagementNotificationSchema>;
export type ReengagementNotification = typeof reengagementNotifications.$inferSelect;

// ============================================================
// Welcome notifications (for users who never ordered)
// ============================================================
export const welcomeNotifications = pgTable("welcome_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(), // one per user
  discountCode: varchar("discount_code", { length: 32 }).notNull().unique(),
  discountPercent: integer("discount_percent").notNull().default(10),
  minOrderAmount: integer("min_order_amount").notNull().default(5000), // minimum rubles
  status: text("status").notNull().default('sent'), // 'sent' | 'used' | 'expired'
  telegramSent: boolean("telegram_sent").notNull().default(false),
  emailSent: boolean("email_sent").notNull().default(false),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  usedInOrderId: varchar("used_in_order_id"),
  error: text("error"),
});

export const insertWelcomeNotificationSchema = createInsertSchema(welcomeNotifications).omit({ id: true, sentAt: true });
export type InsertWelcomeNotification = z.infer<typeof insertWelcomeNotificationSchema>;
export type WelcomeNotification = typeof welcomeNotifications.$inferSelect;

// ============================================================
// WEB E-COMMERCE AUTH TABLES (separate from Telegram auth)
// ============================================================

// Utenti web (registrazione con email/password, separati da Telegram)
export const webUsers = pgTable("web_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").unique(),
  phone: text("phone").unique(),
  passwordHash: text("password_hash"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  avatar: text("avatar"),
  isEmailVerified: boolean("is_email_verified").notNull().default(false),
  isPhoneVerified: boolean("is_phone_verified").notNull().default(false),
  verificationToken: text("verification_token"),
  verificationTokenExpiresAt: timestamp("verification_token_expires_at"),
  resetPasswordToken: text("reset_password_token"),
  resetPasswordExpiresAt: timestamp("reset_password_expires_at"),
  // Collegamento opzionale all'account Telegram
  telegramUserId: varchar("telegram_user_id"),
  // Accesso backoffice
  isAdmin: boolean("is_admin").notNull().default(false),
  isMasterAdmin: boolean("is_master_admin").notNull().default(false),
  // Preferenze
  marketingConsent: boolean("marketing_consent").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertWebUserSchema = createInsertSchema(webUsers).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWebUser = z.infer<typeof insertWebUserSchema>;
export type WebUser = typeof webUsers.$inferSelect;

// Sessioni web (refresh token per JWT rotation)
export const webSessions = pgTable("web_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => webUsers.id, { onDelete: 'cascade' }),
  refreshToken: text("refresh_token").notNull().unique(),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at").notNull().defaultNow(),
});

export const insertWebSessionSchema = createInsertSchema(webSessions).omit({ id: true, createdAt: true });
export type InsertWebSession = z.infer<typeof insertWebSessionSchema>;
export type WebSession = typeof webSessions.$inferSelect;

// Account OAuth (Google, etc.)
export const oauthAccounts = pgTable("oauth_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => webUsers.id, { onDelete: 'cascade' }),
  provider: text("provider").notNull(), // 'google' | 'apple'
  providerUserId: text("provider_user_id").notNull(),
  email: text("email"),
  displayName: text("display_name"),
  avatar: text("avatar"),
  accessToken: text("access_token"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOauthAccountSchema = createInsertSchema(oauthAccounts).omit({ id: true, createdAt: true });
export type InsertOauthAccount = z.infer<typeof insertOauthAccountSchema>;
export type OauthAccount = typeof oauthAccounts.$inferSelect;

// Lista desideri web
export const webWishlists = pgTable("web_wishlists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => webUsers.id, { onDelete: 'cascade' }),
  productId: varchar("product_id").notNull().references(() => products.id, { onDelete: 'cascade' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertWebWishlistSchema = createInsertSchema(webWishlists).omit({ id: true, createdAt: true });
export type InsertWebWishlist = z.infer<typeof insertWebWishlistSchema>;
export type WebWishlist = typeof webWishlists.$inferSelect;

// Indirizzi salvati utenti web
export const webAddresses = pgTable("web_addresses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => webUsers.id, { onDelete: 'cascade' }),
  label: text("label").notNull().default('Дом'), // 'Дом' | 'Работа' | custom
  fullAddress: text("full_address").notNull(),
  city: text("city").notNull(),
  street: text("street"),
  building: text("building"),
  apartment: text("apartment"),
  postalCode: text("postal_code"),
  notes: text("notes"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertWebAddressSchema = createInsertSchema(webAddresses).omit({ id: true, createdAt: true });
export type InsertWebAddress = z.infer<typeof insertWebAddressSchema>;
export type WebAddress = typeof webAddresses.$inferSelect;

// ── NOTIFICATION SETTINGS ──────────────────────────────────────────────────
// Global per-channel on/off switch (one row per channel)
export const notificationChannelSettings = pgTable("notification_channel_settings", {
  channel: text("channel").primaryKey(), // 'telegram' | 'whatsapp' | 'email'
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: varchar("updated_by"), // web user ID
});

// Per-user opt-out per channel (unique per userId+channel)
export const userNotificationPreferences = pgTable("user_notification_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // Telegram user ID
  channel: text("channel").notNull(),   // 'telegram' | 'whatsapp' | 'email'
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type NotificationChannelSetting = typeof notificationChannelSettings.$inferSelect;
export type UserNotificationPreference = typeof userNotificationPreferences.$inferSelect;

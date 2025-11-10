CREATE TABLE "abandoned_cart_notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"cart_snapshot" jsonb NOT NULL,
	"discount_percent" integer NOT NULL,
	"discount_code" varchar NOT NULL,
	"channel" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"used_in_order_id" varchar,
	"error" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "abandoned_cart_notifications_discount_code_unique" UNIQUE("discount_code")
);
--> statement-breakpoint
CREATE TABLE "admin_action_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" varchar NOT NULL,
	"telegram_username" text,
	"action_type" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar,
	"action_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admins" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"telegram_username" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"total_orders" integer DEFAULT 0 NOT NULL,
	"total_revenue" numeric(12, 2) DEFAULT '0' NOT NULL,
	"average_order_value" numeric(10, 2) DEFAULT '0' NOT NULL,
	"new_customers" integer DEFAULT 0 NOT NULL,
	"returning_customers" integer DEFAULT 0 NOT NULL,
	"abandoned_carts" integer DEFAULT 0 NOT NULL,
	"cart_reminders_sent" integer DEFAULT 0 NOT NULL,
	"visitors" integer DEFAULT 0,
	"conversion_rate" numeric(5, 2) DEFAULT '0',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_snapshots_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "bonuses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"percentage" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"from_order_id" varchar,
	"used" boolean DEFAULT false NOT NULL,
	"used_in_order_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"next_reminder_check_at" timestamp with time zone,
	"reminder_sent" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"image" text,
	"parent_id" varchar,
	"sort_order" integer DEFAULT 0,
	"is_visible" boolean DEFAULT true NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courier_tracking" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"latitude" numeric(10, 7) NOT NULL,
	"longitude" numeric(10, 7) NOT NULL,
	"heading" numeric(5, 2),
	"speed" numeric(5, 2),
	"eta_minutes" integer,
	"reported_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorite_products" (
	"user_id" varchar NOT NULL,
	"product_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fortune_spin_tokens" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"tokens" integer DEFAULT 3 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_change_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"admin_user_id" varchar,
	"change_type" text NOT NULL,
	"change_data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_points" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"point_id" integer NOT NULL,
	"type" text NOT NULL,
	"full_address" text NOT NULL,
	"city" text,
	"street" text,
	"building" text,
	"flat" text,
	"porch" text,
	"floor" text,
	"latitude" numeric(10, 7) NOT NULL,
	"longitude" numeric(10, 7) NOT NULL,
	"contact_name" text NOT NULL,
	"contact_phone" text NOT NULL,
	"contact_email" text,
	"comment" text,
	"time_window_from" timestamp,
	"time_window_to" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"items" jsonb NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"discount" numeric(10, 2) DEFAULT '0',
	"discount_type" text,
	"discount_value" text,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"customer_email" text,
	"delivery_address" text NOT NULL,
	"delivery_postal_code" text,
	"dadata_fias_id" text,
	"delivery_notes" text,
	"delivery_method" text,
	"status" text DEFAULT 'ОФОРМЛЕН' NOT NULL,
	"payment_method" text DEFAULT 'yookassa' NOT NULL,
	"payment_id" varchar,
	"payment_link_sent_at" timestamp,
	"receipt_id" varchar,
	"receipt_url" text,
	"receipt_status" text,
	"fiscal_data" jsonb,
	"spin_tokens_awarded" boolean DEFAULT false NOT NULL,
	"courier_service" text,
	"courier_order_id" text,
	"courier_tracking_url" text,
	"courier_called_at" timestamp,
	"yandex_claim_id" text,
	"yandex_delivery_price" numeric(10, 2),
	"yandex_delivery_offer_id" text,
	"yandex_delivery_status" text,
	"yandex_performer_info" jsonb,
	"yandex_go_claim_id" text,
	"yandex_go_price" numeric(10, 2),
	"yandex_go_offer_id" text,
	"yandex_go_status" text,
	"yandex_go_performer_info" jsonb,
	"pickup_coordinates" text[],
	"delivery_coordinates" text[],
	"delivery_latitude" numeric(10, 7),
	"delivery_longitude" numeric(10, 7),
	"delivery_cost" numeric(10, 2),
	"customer_pays_shipping" boolean DEFAULT true NOT NULL,
	"shipping_payment_method" text,
	"refund_id" varchar,
	"refund_status" text,
	"refund_reason" text,
	"refunded_amount" numeric(10, 2),
	"refunded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"provider" text DEFAULT 'SBP' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"redirect_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE "pickup_addresses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"full_address" text NOT NULL,
	"city" text,
	"street" text,
	"building" text,
	"flat" text,
	"postal_code" text,
	"dadata_fias_id" text,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"contact_name" text,
	"contact_phone" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prizes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"value" text NOT NULL,
	"product_ids" text[] DEFAULT ARRAY[]::text[],
	"claimed" boolean DEFAULT false NOT NULL,
	"claimed_at" timestamp,
	"order_id" varchar,
	"admin_used_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_associations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_product_id" varchar NOT NULL,
	"target_product_id" varchar NOT NULL,
	"reason" text,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_marking_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" varchar NOT NULL,
	"order_id" varchar NOT NULL,
	"marking_code" text NOT NULL,
	"operator_id" varchar NOT NULL,
	"operator_username" text,
	"scanned_at" timestamp DEFAULT now() NOT NULL,
	"order_date" timestamp NOT NULL,
	CONSTRAINT "product_marking_logs_marking_code_unique" UNIQUE("marking_code")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"category_id" varchar NOT NULL,
	"images" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"price_old" numeric(10, 2),
	"unit" text DEFAULT 'кг' NOT NULL,
	"in_stock" boolean DEFAULT true NOT NULL,
	"sort_priority" integer DEFAULT 0 NOT NULL,
	"taste_variations" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"taste_rating_stats" jsonb DEFAULT '{"tasty":0,"veryTasty":0,"superTasty":0}'::jsonb NOT NULL,
	"description_short" text,
	"description_full" text,
	"nutrition" jsonb,
	"requires_marking" boolean DEFAULT false NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "spins" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"prize_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_addresses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"label" text NOT NULL,
	"full_address" text NOT NULL,
	"city" text,
	"street" text,
	"building" text,
	"flat" text,
	"postal_code" text,
	"dadata_fias_id" text,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"phone" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY NOT NULL,
	"username" text,
	"first_name" text,
	"last_name" text,
	"phone" text,
	"email" text,
	"customer_name" text,
	"address" text,
	"city" text,
	"building" text,
	"apartment" text,
	"address_notes" text
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar,
	"source" text NOT NULL,
	"event_type" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"processing_error" text,
	"http_method" text,
	"http_headers" jsonb,
	"signature" text,
	"signature_valid" boolean,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "abandoned_cart_notifications" ADD CONSTRAINT "abandoned_cart_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abandoned_cart_notifications" ADD CONSTRAINT "abandoned_cart_notifications_used_in_order_id_orders_id_fk" FOREIGN KEY ("used_in_order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonuses" ADD CONSTRAINT "bonuses_from_order_id_orders_id_fk" FOREIGN KEY ("from_order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonuses" ADD CONSTRAINT "bonuses_used_in_order_id_orders_id_fk" FOREIGN KEY ("used_in_order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courier_tracking" ADD CONSTRAINT "courier_tracking_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_products" ADD CONSTRAINT "favorite_products_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_products" ADD CONSTRAINT "favorite_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_change_logs" ADD CONSTRAINT "order_change_logs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_points" ADD CONSTRAINT "order_points_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prizes" ADD CONSTRAINT "prizes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_associations" ADD CONSTRAINT "product_associations_source_product_id_products_id_fk" FOREIGN KEY ("source_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_associations" ADD CONSTRAINT "product_associations_target_product_id_products_id_fk" FOREIGN KEY ("target_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_marking_logs" ADD CONSTRAINT "product_marking_logs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_marking_logs" ADD CONSTRAINT "product_marking_logs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spins" ADD CONSTRAINT "spins_prize_id_prizes_id_fk" FOREIGN KEY ("prize_id") REFERENCES "public"."prizes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
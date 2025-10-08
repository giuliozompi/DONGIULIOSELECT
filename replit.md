# Don Giulio Select - Telegram Mini App

## Overview

Don Giulio Select is a Telegram Mini App for an Italian premium delicatessen e-commerce store. The application provides a mobile-first shopping experience within Telegram, featuring product browsing, cart management, payment integration, an AI assistant for product recommendations, and a gamified fortune wheel for prizes.

The app is built as a modern full-stack TypeScript application with React frontend and Express backend, leveraging Telegram's WebApp API for native integration.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Core Libraries**
- **React 18** with TypeScript for component-based UI
- **Wouter** for client-side routing (lightweight alternative to React Router)
- **TanStack Query v5** for server state management and caching
- **Vite** as build tool and development server

**UI Component System**
- **shadcn/ui** component library based on Radix UI primitives
- **Tailwind CSS** for utility-first styling with custom design tokens
- **Telegram WebApp SDK** (`@twa-dev/sdk`) for native Telegram integration
- Theme system synchronized with Telegram's light/dark modes via `themeParams`

**Design Philosophy**
- Mobile-first responsive design optimized for Telegram WebApp viewport
- Minimalist interface with generous whitespace
- Native Telegram UI/UX patterns (colors, buttons, navigation)
- Russian language interface throughout

**State Management**
- Server state: TanStack Query with optimistic updates
- Local state: React hooks (useState, useEffect)
- Cart state: Server-synchronized via API
- Telegram state: Custom hooks (`useTelegramBackButton`, `useTelegramMainButton`)

### Backend Architecture

**Server Framework**
- **Express.js** with TypeScript
- RESTful API design pattern
- Session-based authentication with Telegram init data verification
- Middleware for authentication and request logging

**API Structure**
- `/api/categories` - Category hierarchy management
- `/api/products` - Product catalog with filtering
- `/api/cart` - Shopping cart operations
- `/api/orders` - Order creation and management
- `/api/payments/sbp` - Payment processing integration
- `/api/fortune` - Gamification (fortune wheel, prizes)
- `/api/assistant` - AI-powered product assistant
- `/api/admin/*` - Admin panel endpoints (protected)

**Authentication & Security**
- Telegram WebApp init data verification using HMAC-SHA256
- User identity from Telegram user data (id, username, firstName, lastName)
- Development mode bypass for testing
- CSRF protection via Telegram signature validation
- Admin authentication via whitelist (`admins` table)
- Protected admin routes use middleware chain: `verifyTelegramInitData` + `requireAdmin`

**Business Logic**
- Product catalog with 3-level category hierarchy
- Shopping cart with quantity management (weight-based and unit-based products)
- Order lifecycle: new → pending_payment → paid/failed/cancelled
- Taste rating system for products (tasty/very_tasty/super)
- Fortune wheel token system with prize distribution

### Admin Panel

**Access Control**
- Admin users are defined in the `admins` database table (whitelist approach)
- Admin status is verified via GET `/api/admin/check` endpoint
- All admin routes protected by middleware chain: `verifyTelegramInitData` → `requireAdmin`
- Unauthorized access returns 403 Forbidden
- Admin navigation link appears only for authorized users

**Admin UI** (`/admin` route)
- Tab-based interface with 5 tabs: Categories, Products, Orders, Admins, Recommendations
- Built with shadcn/ui components (Tabs, Card, Form, Button)
- Real-time updates via TanStack Query cache invalidation
- Toast notifications for success/error feedback

**Category Management**
- **Create**: Form with name, slug, icon, parentId, sortOrder
- **Edit**: Inline editing with pre-populated form
- **Delete**: Cascade deletes products in category
- API endpoints:
  - POST `/api/admin/categories` - Create new category
  - PATCH `/api/admin/categories/:id` - Update category
  - DELETE `/api/admin/categories/:id` - Delete category

**Product Management**
- **Create/Edit**: Comprehensive form with all product fields
  - Basic: name, slug, categoryId
  - Pricing: price, priceOld (optional)
  - Media: images (comma-separated URLs)
  - Attributes: unit, inStock, tasteVariations (comma-separated)
  - Descriptions: descriptionShort, descriptionFull
- **Type Conversion**: Form handles string inputs, converts to proper types before submission
  - Arrays: comma-separated strings → string arrays
  - Numbers: string inputs → decimal/numeric types
- **Validation**: Backend validates with Zod schemas from `shared/schema.ts`
- API endpoints:
  - POST `/api/admin/products` - Create new product
  - PATCH `/api/admin/products/:id` - Update product
  - DELETE `/api/admin/products/:id` - Delete product

**Order Management (NEW - October 2025)**
- **Full Order Editing**: Admins can modify orders with comprehensive audit logging
- **Edit Dialog**: Modal interface with all editing capabilities
  - Modify product quantities with validation
  - Add new products from catalog (smart default: 0.2kg for weight-based, 1 for piece-based)
  - Remove products (prevents removing all items)
  - Apply discounts (percentage or fixed amount)
  - Change delivery address
- **Audit Trail**: All changes logged in `order_change_logs` table
  - Change types: `quantity_changed`, `product_added`, `product_removed`, `discount_applied`, `address_changed`
  - Stores admin user ID, timestamp, and detailed change data (JSONB)
  - Displayed in chronological order in edit dialog
- **API Endpoints**:
  - POST `/api/admin/orders/:id/update-quantity` - Update product quantity
  - POST `/api/admin/orders/:id/add-product` - Add product to order (quantity optional)
  - POST `/api/admin/orders/:id/remove-product` - Remove product from order
  - POST `/api/admin/orders/:id/apply-discount` - Apply percentage/fixed discount
  - POST `/api/admin/orders/:id/change-address` - Update delivery address
  - GET `/api/admin/orders/:id/logs` - Retrieve change history
- **Automatic Recalculation**: Helper function `calculateOrderTotal()` ensures correct totals
  - Preserves existing discounts when modifying products (quantity/add/remove)
  - Recalculates discount amount from subtotal (prevents compounding errors)
  - Handles both percentage and fixed discounts correctly
- **Dispute Resolution**: Complete audit trail enables customer service dispute resolution

**Administrator Management**
- **Add/Remove Admins**: Interface to manage admin whitelist
- **Admin List**: Display all administrators with Telegram usernames
- API endpoints:
  - GET `/api/admin/admins` - List all admins
  - POST `/api/admin/admins` - Add new admin
  - DELETE `/api/admin/admins/:userId` - Remove admin

**Product Recommendations (NEW - October 2025)**
- **Product Associations**: System to recommend complementary products when items are added to cart
- **Association Management**: Admin interface to create source→target product relationships
  - Create associations with optional reason text (e.g., "Mozzarella → Olive Oil: Perfect pairing")
  - View all associations with product names displayed
  - Delete associations when no longer relevant
  - Sort order field for ranking multiple recommendations
- **Customer Experience**: After adding a product to cart, a dialog appears showing recommended products
  - Dialog displays: product images, names, prices, reason for recommendation
  - Quick-add functionality: customers can add recommended products with one click
  - Quantity controls within dialog for weight-based and unit-based products
- **API Endpoints**:
  - POST `/api/admin/product-associations` - Create product association (admin only)
  - GET `/api/admin/product-associations` - List all associations with product details
  - DELETE `/api/admin/product-associations/:id` - Delete association (admin only)
  - GET `/api/products/:id/recommendations` - Get recommendations for a product (public)
- **UI Components**:
  - `ProductAssociationsManager` - Admin tab for managing associations
  - `ProductRecommendationsDialog` - Customer-facing dialog with recommendations
  - Integration in `ProductCard` - Triggers dialog after successful cart addition

**Security Implementation**
- Middleware: `server/middleware/requireAdmin.ts`
  - Verifies `req.userId` is set (from Telegram auth)
  - Checks if `userId` exists in `admins` table
  - Returns 401 if not authenticated, 403 if not admin
- Storage methods: `storage.isAdmin(userId)`, `storage.addAdmin(userId)`
- No privilege escalation: Admin status cannot be self-assigned via UI

**Testing**
- End-to-end Playwright tests verify:
  - Admin authentication and access control
  - Category CRUD operations
  - Product CRUD with proper type conversion
  - Database persistence and data integrity
  - UI feedback and navigation

### Data Storage

**Database**
- **PostgreSQL** via Neon serverless
- **Drizzle ORM** for type-safe database queries
- Connection pooling with `@neondatabase/serverless`

**Schema Design**
- `users` - Telegram user profiles
- `admins` - Admin user whitelist (userId references)
- `categories` - 3-level hierarchical categories (parentId relationship)
- `products` - Product catalog with images, pricing, variations
- `carts` - User shopping carts with JSONB items
- `orders` - Order records with status tracking and delivery information
  - Legacy: `deliveryAddress` (full text address for backward compatibility)
  - Structured: `deliveryCity`, `deliveryStreet`, `deliveryBuilding`, `deliveryFlat`, `deliveryPostalCode`, `dadataFiasId` (for logistics integration)
  - Discount fields: `discount` (amount), `discountType` (percentage/fixed), `discountValue` (original value)
- `user_addresses` - Multiple saved addresses per user
  - Fields: userId, fullAddress, city, street, building, flat, postalCode, fiasId, isDefault
  - Enables quick address selection during checkout
- `order_change_logs` - Audit trail for order modifications (NEW - October 2025)
  - Fields: orderId, adminUserId, changeType, changeData (JSONB), createdAt
  - Change types: quantity_changed, product_added, product_removed, discount_applied, address_changed
  - Enables dispute resolution and customer service tracking
- `product_associations` - Product recommendations system (NEW - October 2025)
  - Fields: id, sourceProductId, targetProductId, sortOrder, reason (optional text)
  - Defines complementary product relationships (e.g., Mozzarella → Olive Oil)
  - Used to show recommendation dialog after cart additions
  - Unique constraint on (sourceProductId, targetProductId) to prevent duplicates
- `payment_intents` - Payment transaction records
- `fortune_spin_tokens` - Gamification tokens per user
- `prizes` - Available prizes (discounts, gifts, coupons)
- `spins` - Fortune wheel spin history
- `conversations` & `messages` - AI assistant chat history

**Data Patterns**
- JSONB columns for flexible data (cart items, nutrition info, taste stats)
- UUID primary keys for distributed scalability
- Array types for multi-value fields (images, taste variations)
- Timestamp tracking with defaults

### External Dependencies

**Third-Party Services**

1. **Telegram WebApp Platform**
   - Purpose: Native app hosting and user authentication
   - Integration: Telegram WebApp SDK, init data verification
   - Features used: MainButton, BackButton, HapticFeedback, theme params

2. **OpenRouter AI API**
   - Purpose: AI-powered product assistant
   - Model: Anthropic Claude 3 Haiku (default)
   - Service: `server/services/openrouter.ts`
   - Features: Conversational product recommendations in Italian/Russian

3. **SBP (Sistema di Pagamenti Veloci) Payment Gateway**
   - Purpose: Payment processing for Russian market
   - Implementation: Mock service (`server/services/sbp-payment.ts`)
   - Note: Production requires real Sberbank API integration
   - Features: Payment intent creation, QR codes, webhook callbacks

4. **DaData.ru Address Autocomplete**
   - Purpose: Russian address validation and standardization for logistics integration
   - Service: `server/services/dadata.ts`
   - API Token: `DADATA_API_TOKEN` environment variable (optional - graceful fallback if not configured)
   - Features:
     - Address autocomplete with FIAS (Federal Information Address System) integration
     - Structured address decomposition (city, street, building, apartment, postal code)
     - Real-time suggestions with debounced search (300ms)
     - Automatic postal code and FIAS ID retrieval for logistics services
   - Implementation:
     - Frontend: `AddressAutocomplete` component in checkout form
     - Backend: `/api/address/suggest` endpoint for proxy requests
     - Fallback: Works without API token, allows manual address entry
     - Data Consistency: Resets structured address when user edits manually

4. **Neon Database**
   - Purpose: Serverless PostgreSQL hosting
   - Configuration: Via `DATABASE_URL` environment variable
   - Features: Connection pooling, WebSocket support

**NPM Dependencies**
- UI: `@radix-ui/*` primitives, `lucide-react` icons, `tailwindcss`
- Forms: `react-hook-form`, `@hookform/resolvers`, `zod`
- Data: `drizzle-orm`, `drizzle-zod`
- Utilities: `date-fns`, `nanoid`, `clsx`, `class-variance-authority`
- Development: `tsx`, `vite`, `esbuild`, `@replit/*` plugins

**Asset Management**
- Product images: External URLs (Unsplash placeholders)
- Static assets: Vite asset pipeline
- Build output: `dist/public` for frontend, `dist/index.js` for backend
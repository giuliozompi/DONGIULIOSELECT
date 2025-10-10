# Don Giulio Select - Telegram Mini App

## Overview
Don Giulio Select is a Telegram Mini App serving as an e-commerce platform for a premium Italian delicatessen. It offers a mobile-first shopping experience directly within Telegram, enabling users to browse products, manage their cart, make payments, receive AI-driven product recommendations, and engage with a gamified fortune wheel for prizes. The application is a full-stack TypeScript project, utilizing React for the frontend and Express.js for the backend, with deep integration via Telegram's WebApp API. The project aims to provide a seamless and engaging e-commerce solution within the Telegram ecosystem.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is built with **React 18** and TypeScript, using **Wouter** for routing and **TanStack Query v5** for server state management. **Vite** is used for development and building. The UI leverages **shadcn/ui** (based on Radix UI) and **Tailwind CSS** for styling, adhering to a mobile-first, minimalist design that aligns with native Telegram UI/UX patterns, including **automatic theme synchronization** with Telegram's day/night mode. The **Telegram WebApp SDK** (`@twa-dev/sdk`) is crucial for native integration and access to Telegram-specific features.

#### Telegram Theme Integration
The application automatically synchronizes with Telegram's theme (day/night mode) in real-time:

- **TelegramThemeProvider**: React component that wraps the entire app and manages theme synchronization
- **Color Detection**: Analyzes Telegram's `bg_color` parameter to determine light/dark mode using luminance calculation (0.299R + 0.587G + 0.114B)
- **Real-time Updates**: Listens to Telegram's `themeChanged` event to instantly update when users switch themes
- **Fallback Strategy**: Uses `colorScheme` API when `bg_color` is unavailable
- **CSS Integration**: Toggles the `dark` class on `document.documentElement`, triggering Tailwind's dark mode variants
- **Seamless Transition**: Applies Telegram's background color to `body` for perfect visual continuity

This ensures the app always matches the user's Telegram appearance settings, providing a native-feeling experience within the Telegram ecosystem.

### Backend
The backend is an **Express.js** application written in TypeScript, implementing a RESTful API. It handles product catalog management, shopping cart logic, order processing, payment integration, gamification features, and an AI assistant. Authentication relies on Telegram WebApp init data verification, with session-based authentication and HMAC-SHA256 for security. An administrative panel is included for managing categories, products, orders (with audit logging), administrators, and product recommendations, protected by role-based access control.

### Data Storage
**PostgreSQL** (via Neon serverless) is the primary database, accessed using **Drizzle ORM** for type-safe queries. The schema includes tables for users, admins, product categories, products, shopping carts, orders (with detailed delivery and discount fields, delivery method selection, and audit logs), user addresses (saved addresses with labels and default flag), product associations for recommendations, payment intents, and gamification data (fortune spin tokens, prizes, spins). JSONB columns are used for flexible data structures.

#### Delivery Methods
Orders support four delivery methods (stored in `orders.delivery_method`):
- **yandex_go**: Яндекс го (доставку оплачивается в приложение) - Yandex Go delivery, paid in app
- **cdek**: Сдек (оплата доставку по России при получением) - CDEK delivery, payment on delivery across Russia
- **don_giulio_courier**: Дон Джулио курьер (договариваетесь с менеджером) - Don Giulio courier, arrange with manager
- **pickup**: Самовывоз (бесплатно) - Self-pickup, free

#### Saved Addresses
Users can save delivery addresses for quick reuse in future orders. The `user_addresses` table stores:
- Address label (e.g., "Дом", "Офис", "Дача")
- Full address and structured fields (city, street, building, flat, postal code)
- DaData FIAS ID for standardization
- Default flag for automatic selection
- Ownership verification ensures users can only access their own addresses

#### Saved Customer Information
The application automatically saves customer contact information from checkout forms for convenience in future orders. The `users` table stores:
- **customerName**: Full name as entered by the user in checkout
- **phone**: Phone number for order communication
- **email**: Email address for order confirmations

**Auto-save Flow:**
1. User completes checkout with name, phone, and email
2. Order is created successfully
3. System automatically saves customerName, phone, and email to user's profile
4. Next checkout visit: form fields are pre-filled with saved information

This feature eliminates repetitive data entry while maintaining user privacy—each user only accesses their own saved information.

### Admin Panel
A sidebar-based admin interface (`/admin`) with hierarchical navigation allows authorized users to manage various aspects of the application. The system implements a **two-tier administration model**:

#### Two-Tier Administration
- **Master Administrator**: Defined by the `MASTER_ADMIN_USER_ID` environment secret (user ID: 201331998 / @DonGiulioMoscow). Has full privileges including managing other administrators.
- **Regular Administrators**: Can manage categories, products, orders, and product recommendations, but cannot add/remove other administrators.

#### Navigation Structure
The admin panel is organized with a collapsible sidebar containing:

**A) Amministrazione** (Catalog Management)
- **Categorie** (Categories): Create, edit, and delete product categories (all admins)
- **Prodotti** (Products): Comprehensive forms for creating and editing products, including pricing, media, attributes, and descriptions (all admins)
- **Raccomandazioni** (Recommendations): Manage associations between products to suggest complementary items to users (all admins)

**B) Gestione** (Operations Management)
- **Ordini** (Orders): Full editing capabilities for orders, including product quantities, additions, removals, discounts, and delivery address changes (all admins)

**Additional Functions** (separate from groups)
- **Администраторы** (Administrators): Add and remove users from the admin whitelist (master admin only)
- **Логи** (Action Logs): View comprehensive audit trail of all admin actions (all admins)

The sidebar automatically closes when a menu item is selected, allowing managers to immediately work on the selected section without manually closing the sidebar.

#### Audit Logging
All administrative actions are tracked in the `admin_action_logs` table with the following information:
- Admin user ID and Telegram username
- Action type (created, updated, deleted)
- Entity type (category, product, product_association, admin)
- Entity ID and detailed action data (JSONB)
- Timestamp

The audit log is accessible via the "Логи" (Logs) tab in the admin panel, displaying actions in chronological order with formatted details for accountability and troubleshooting.

### Image Management & Object Storage
The application uses **Replit Object Storage** for managing product and category images, providing secure admin-only uploads with public accessibility for all users.

#### Architecture
- **Server Components**: 
  - `server/objectStorage.ts`: Core service for upload URL generation, file serving, and path normalization
  - `server/objectAcl.ts`: ACL policy management with metadata-driven public/private visibility
  - Protected API routes requiring admin authentication for uploads

- **Frontend Components**:
  - `ObjectUploader`: Reusable Uppy-based component for drag-drop file uploads with modal interface
  - Integrated into admin category and product forms with real-time preview

#### Upload Flow
1. **Admin initiates upload**: Clicks "Загрузить" button in category/product form
2. **Presigned URL**: Frontend requests POST `/api/objects/upload` (admin-only) to get temporary upload URL
3. **Direct upload**: Uppy uploads file directly to object storage using presigned URL
4. **ACL configuration**: Frontend calls PUT `/api/admin/category-images` or PUT `/api/admin/product-images` to set public visibility
5. **Path normalization**: Server returns normalized path (`/objects/uploads/...`) stored in database
6. **Public access**: Images are served via GET `/objects/:objectPath` route, accessible to all users

#### Environment Variables
- `DEFAULT_OBJECT_STORAGE_BUCKET_ID`: Replit-managed bucket identifier
- `PUBLIC_OBJECT_SEARCH_PATHS`: Comma-separated paths for public asset resolution
- `PRIVATE_OBJECT_DIR`: Base directory for admin-uploaded files (e.g., `.private`)

#### Form Integration
- **Category Form**: Single image upload with thumbnail preview, readonly path display
- **Product Form**: Multiple image upload (up to 5 files), gallery preview, comma-separated paths in textarea

All uploads are restricted to 5MB per file, images only, with automatic error handling and toast notifications.

## External Dependencies

1.  **Telegram WebApp Platform**: Provides native app hosting, user authentication, and UI/UX integration via the Telegram WebApp SDK.
2.  **OpenRouter AI API**: Used for the AI-powered product assistant, primarily utilizing Anthropic Claude 3 Haiku for conversational recommendations. The assistant has four professional roles:
    - **Cheese Sommelier**: Expert in Italian cheeses, aging, and pairings
    - **Meat Expert**: Specialist in cured meats, prosciuttos, and quality meats
    - **Product Expert**: Deep knowledge of all Italian premium products
    - **Wine Sommelier**: Expert in wine-food pairings
    
    The assistant is **multilingual** and responds in the same language the customer uses (Russian, Italian, English, or any other language). It prioritizes suggesting products from the database catalog first, then recommends contacting the Telegram channel if suitable products aren't available. For wine pairings, it can currently suggest any wines available in Russia; a proprietary wine database will be added in the future.
    
    **Assistant UI/UX** (`/assistant`): The assistant page is optimized for small screens with a top-down layout: Header → Welcome message (with role descriptions) → Input field (fixed, always visible) → Scrollable message area. This ensures the input is immediately accessible without scrolling. The assistant is accessible via the bottom navigation (Bot icon, positioned after "Призы" and before "Админ" for admin users).
3.  **SBP (Sistema di Pagamenti Veloci) Payment Gateway**: Integrated for payment processing, with a mock service in the current implementation, pending full Sberbank API integration.
4.  **DaData.ru Address Autocomplete**: Utilized for Russian address validation, standardization, and autocomplete, enhancing logistics integration with FIAS IDs and structured address data.
5.  **Neon Database**: Provides serverless PostgreSQL hosting, configured via `DATABASE_URL`.
6.  **NPM Dependencies**: A range of libraries for UI (Radix UI, Tailwind CSS), forms (react-hook-form, Zod), data persistence (Drizzle ORM), utilities, and development tools.
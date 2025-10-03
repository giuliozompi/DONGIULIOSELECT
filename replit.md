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

**Authentication & Security**
- Telegram WebApp init data verification using HMAC-SHA256
- User identity from Telegram user data (id, username, firstName, lastName)
- Development mode bypass for testing
- CSRF protection via Telegram signature validation

**Business Logic**
- Product catalog with 3-level category hierarchy
- Shopping cart with quantity management (weight-based and unit-based products)
- Order lifecycle: new → pending_payment → paid/failed/cancelled
- Taste rating system for products (tasty/very_tasty/super)
- Fortune wheel token system with prize distribution

### Data Storage

**Database**
- **PostgreSQL** via Neon serverless
- **Drizzle ORM** for type-safe database queries
- Connection pooling with `@neondatabase/serverless`

**Schema Design**
- `users` - Telegram user profiles
- `categories` - 3-level hierarchical categories (parentId relationship)
- `products` - Product catalog with images, pricing, variations
- `carts` - User shopping carts with JSONB items
- `orders` - Order records with status tracking
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
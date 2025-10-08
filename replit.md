# Don Giulio Select - Telegram Mini App

## Overview
Don Giulio Select is a Telegram Mini App serving as an e-commerce platform for a premium Italian delicatessen. It offers a mobile-first shopping experience directly within Telegram, enabling users to browse products, manage their cart, make payments, receive AI-driven product recommendations, and engage with a gamified fortune wheel for prizes. The application is a full-stack TypeScript project, utilizing React for the frontend and Express.js for the backend, with deep integration via Telegram's WebApp API. The project aims to provide a seamless and engaging e-commerce solution within the Telegram ecosystem.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is built with **React 18** and TypeScript, using **Wouter** for routing and **TanStack Query v5** for server state management. **Vite** is used for development and building. The UI leverages **shadcn/ui** (based on Radix UI) and **Tailwind CSS** for styling, adhering to a mobile-first, minimalist design that aligns with native Telegram UI/UX patterns, including theme synchronization. The **Telegram WebApp SDK** (`@twa-dev/sdk`) is crucial for native integration and access to Telegram-specific features.

### Backend
The backend is an **Express.js** application written in TypeScript, implementing a RESTful API. It handles product catalog management, shopping cart logic, order processing, payment integration, gamification features, and an AI assistant. Authentication relies on Telegram WebApp init data verification, with session-based authentication and HMAC-SHA256 for security. An administrative panel is included for managing categories, products, orders (with audit logging), administrators, and product recommendations, protected by role-based access control.

### Data Storage
**PostgreSQL** (via Neon serverless) is the primary database, accessed using **Drizzle ORM** for type-safe queries. The schema includes tables for users, admins, product categories, products, shopping carts, orders (with detailed delivery and discount fields, and audit logs), user addresses, product associations for recommendations, payment intents, and gamification data (fortune spin tokens, prizes, spins). JSONB columns are used for flexible data structures.

### Admin Panel
A tab-based admin interface (`/admin`) allows authorized users to manage various aspects of the application. The system implements a **two-tier administration model**:

#### Two-Tier Administration
- **Master Administrator**: Defined by the `MASTER_ADMIN_USER_ID` environment secret (user ID: 201331998 / @DonGiulioMoscow). Has full privileges including managing other administrators.
- **Regular Administrators**: Can manage categories, products, orders, and product recommendations, but cannot add/remove other administrators.

#### Key Functionalities
- **Category Management**: Create, edit, and delete product categories (all admins).
- **Product Management**: Comprehensive forms for creating and editing products, including pricing, media, attributes, and descriptions (all admins).
- **Order Management**: Full editing capabilities for orders, including product quantities, additions, removals, discounts, and delivery address changes (all admins).
- **Administrator Management**: Add and remove users from the admin whitelist (master admin only).
- **Product Recommendations**: Manage associations between products to suggest complementary items to users (all admins).
- **Action Logs**: View comprehensive audit trail of all admin actions (all admins).

#### Audit Logging
All administrative actions are tracked in the `admin_action_logs` table with the following information:
- Admin user ID and Telegram username
- Action type (created, updated, deleted)
- Entity type (category, product, product_association, admin)
- Entity ID and detailed action data (JSONB)
- Timestamp

The audit log is accessible via the "Логи" (Logs) tab in the admin panel, displaying actions in chronological order with formatted details for accountability and troubleshooting.

## External Dependencies

1.  **Telegram WebApp Platform**: Provides native app hosting, user authentication, and UI/UX integration via the Telegram WebApp SDK.
2.  **OpenRouter AI API**: Used for the AI-powered product assistant, primarily utilizing Anthropic Claude 3 Haiku for conversational recommendations.
3.  **SBP (Sistema di Pagamenti Veloci) Payment Gateway**: Integrated for payment processing, with a mock service in the current implementation, pending full Sberbank API integration.
4.  **DaData.ru Address Autocomplete**: Utilized for Russian address validation, standardization, and autocomplete, enhancing logistics integration with FIAS IDs and structured address data.
5.  **Neon Database**: Provides serverless PostgreSQL hosting, configured via `DATABASE_URL`.
6.  **NPM Dependencies**: A range of libraries for UI (Radix UI, Tailwind CSS), forms (react-hook-form, Zod), data persistence (Drizzle ORM), utilities, and development tools.
# Don Giulio Select - Telegram Mini App

## Overview
Don Giulio Select is a Telegram Mini App that functions as an e-commerce platform for a premium Italian delicatessen. It offers a mobile-first shopping experience within Telegram, encompassing product browsing, cart management, payments, AI-driven recommendations, and gamification. The project aims to deliver a seamless and engaging e-commerce solution deeply integrated with Telegram's ecosystem.

**Telegram Mini App URL**: https://t.me/dongiuliocatalog_bot/DGSCatalog

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend utilizes React 18 with TypeScript, Wouter for routing, and TanStack Query v5 for server state, bundled with Vite. UI is constructed with shadcn/ui (Radix UI) and Tailwind CSS, adhering to a mobile-first design that synchronizes with Telegram's theme (day/night mode) via the Telegram WebApp SDK. The admin panel features a responsive card grid, dedicated edit/create pages, and section persistence via URL query parameters. Product displays support multiple images with an auto-rotating slideshow.

### Technical Implementations
The backend is an Express.js application in TypeScript, providing a RESTful API for core e-commerce functionalities, gamification, and AI integration. Authentication relies on Telegram WebApp init data verification and session-based security. Data is stored in PostgreSQL (Neon serverless) and accessed via Drizzle ORM. The server operates in UTC+3 (Europe/Moscow timezone), and all timestamps, logs, and notifications are formatted in Moscow time.

### Feature Specifications
- **User Profile & Personal Cabinet**: Manages user data, favorites, and order history.
- **Admin Panel**: Sidebar-based interface with role-based access for managing categories, products, orders, clients, recommendations, and pickup addresses. Includes visibility controls for categories and products, with secure API design preventing access to hidden items by non-admins. Master Admin can delete orders.
- **Product Marking System**: Tracks unique marking codes for unit-based products, with real-time validation, duplicate handling, and an audit trail. Features smart auto-open logic for marking dialogs and protected saved codes.
- **Gamification**: A fortune wheel system rewards users with spin tokens upon order completion.
- **Payment Flow**: Supports YooKassa Online Payment (with 54-ФЗ compliance and marking code transmission) and Cash on Delivery. Online payment links are sent post-order preparation. The system correctly persists YooKassa payment IDs in both payment link creation and webhook success flows, enabling reliable refund operations.
- **Fiscal Receipt System**: Integrates with YooKassa Receipts API for 54-ФЗ compliance, featuring automatic receipt creation, marking code integration, email notifications, and customer UI for receipt data.
- **Dual Delivery System**: Integrates with Yandex Dostavka (express courier) and Yandex Go (business cargo) for real-time pricing, tracking, and automated order management. Both services share pick-up address management with DaData integration, support claim cancellation, info retrieval, and performer tracking. Includes production-ready features like idempotency keys, correlation IDs, exponential backoff, pre-flight validation, structured logging, and smart fallback. A robust webhook and tracking infrastructure with dedicated database tables (`orderPoints`, `webhookEvents`, `courierTracking`) and E.164 phone validation ensures reliable delivery management. **Payment flow**: Don Giulio always pays for delivery (no payment_on_delivery or fiscalization used), while customers pay for products via YooKassa. Yandex Go uses POST method for `/claims/info` endpoint.
- **Analytics & Reporting**: Complete analytics system with daily snapshots (02:30 MSK cron), historical backfill capability, and robust data aggregation. Features include Summary KPIs (orders, revenue, customers, cart recovery), Top-10 Products by units sold with revenue tracking, and Time Series visualization. Aggregation logic includes data sanitization (Math.round for quantities, NaN guards, product name fallback lookup) to handle malformed historical data. Supports date range queries for flexible reporting periods.

### System Design Choices
- **Database**: PostgreSQL with Drizzle ORM.
- **Image Management**: Replit Object Storage for images, with secure admin-only uploads via presigned URLs.
- **Architecture**: Clear separation between frontend, backend, and external dependencies.

## External Dependencies

1.  **Telegram WebApp Platform**: For native app hosting, authentication, and UI/UX integration.
2.  **OpenRouter AI API**: Powers the AI product assistant (Anthropic Claude 3 Haiku).
3.  **YooKassa Payment Gateway**: For online payment processing and 54-ФЗ compliance.
4.  **Yandex Dostavka API v2**: For express courier delivery services.
5.  **Yandex Go Доставка для бизнеса**: For business cargo delivery services, using the Yandex Cargo API with specific authentication (static API token or OAuth) and webhook support for status updates.
6.  **Meta WhatsApp Business Platform (Cloud API)**: For order notifications and status updates via WhatsApp templates.
7.  **DaData.ru Address Autocomplete**: For Russian address validation and standardization.
8.  **Resend Email API**: For transactional email notifications to customers and managers.
9.  **Neon Database**: Serverless PostgreSQL hosting.
10. **NPM Dependencies**: Libraries for UI (Radix UI, Tailwind CSS), forms (react-hook-form, Zod), and data persistence (Drizzle ORM).
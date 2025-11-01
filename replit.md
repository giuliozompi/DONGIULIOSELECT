# Don Giulio Select - Telegram Mini App

## Overview
Don Giulio Select is a Telegram Mini App serving as an e-commerce platform for a premium Italian delicatessen. It offers a mobile-first shopping experience within Telegram, featuring product browsing, cart management, payments, AI-driven recommendations, and gamification. The project aims to deliver a seamless and engaging e-commerce solution integrated with Telegram's ecosystem.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend uses React 18 with TypeScript, Wouter for routing, and TanStack Query v5 for server state, bundled with Vite. UI is built with shadcn/ui (Radix UI) and Tailwind CSS, adhering to a mobile-first design that synchronizes with Telegram's theme (day/night mode) via the Telegram WebApp SDK. Admin panel features a responsive card grid layout, dedicated edit/create pages, and section persistence via URL query parameters for enhanced usability. Products support multiple images with an auto-rotating slideshow, manual controls, and smooth transitions.

### Technical Implementations
The backend is an Express.js application in TypeScript, providing a RESTful API for core e-commerce functionalities, gamification, and AI integration. Authentication relies on Telegram WebApp init data verification and session-based security. Data is stored in PostgreSQL (Neon serverless) and accessed via Drizzle ORM.

**Timezone Configuration (November 2025)**: The entire server operates in UTC+3 (Europe/Moscow timezone) to align with Russian business operations. All logs, notifications (email, WhatsApp, Telegram), and timestamps are formatted in Moscow time with "МСК" suffix. The `server/utils/date-formatter.ts` utility provides standardized date formatting functions for consistent display across all customer-facing communications and admin logs.

### Feature Specifications
- **User Profile & Personal Cabinet**: Central hub for user data, favorites, and order history, with a pending orders dialog.
- **Admin Panel**: Sidebar-based interface with role-based access for managing categories, products, orders, clients, recommendations, and pickup addresses. Includes search, filtering, and detailed views with editing capabilities. Master Admin can delete orders with cascade deletion of related logs. **Pickup Address Management** section allows admins to create, edit, delete, and set default pickup addresses with DaData autocomplete integration for automatic GPS coordinate extraction.
- **Product Marking System**: Ensures regulatory compliance by tracking unique marking codes for unit-based products, integrated with a sequential acquisition workflow optimized for scanner operators. Features real-time validation, duplicate handling, and an audit trail. Smart auto-open logic: маркировка dialog opens automatically only when codes are incomplete; manual "Маркировка" button always available for viewing/acquiring codes. Saved codes are protected from accidental modification: a dedicated "Edit" button (pencil icon) must be clicked to enable editing mode. Compact text display (text-xs) with 24-character limit for optimal readability. All fields are always visible, with saved codes locked by default.
- **Gamification**: A fortune wheel system that automatically rewards users with spin tokens upon order completion, with idempotent and race-safe token assignment.
- **Payment Flow**: Supports YooKassa Online Payment (with 54-ФЗ compliance and marking code transmission) and Cash on Delivery. Online payment links are sent after order preparation.
- **Dual Delivery System**: Two independent courier services with separate tracking and management:
  - **Yandex Dostavka**: Express courier delivery service (API v2 via https://b2b.taxi.yandex.net) with features:
    - Real-time price calculation with multiple delivery options (express, 30min longer, 60min longer, 4-hour delivery)
    - Distance & ETA display using Haversine formula and API time intervals
    - Smart offer selection - automatically uses the best available offer (payload)
    - Automatic order status tracking with claim ID storage
    - Dedicated admin button and status badge
  - **Yandex Go**: General taxi-based delivery service (API v2 via https://b2b.taxi.yandex.net) with features:
    - Real-time price calculation with cargo specifications (size, weight)
    - Flexible delivery options with customizable requirements (taxi class, cargo type)
    - Independent tracking system with separate claim IDs and status fields
    - Courier acceptance workflow with real-time status updates
    - Dedicated admin button and status badge
  - **Shared Infrastructure**:
    - Pick-up Address Management: Admins can save multiple pick-up addresses with full DaData integration for address validation and GPS coordinate extraction
    - Automatic Coordinate Calculation: GPS coordinates for both pickup and delivery locations are automatically extracted from DaData API responses
    - Both services support claim cancellation, info retrieval, and real-time performer tracking
  - **Production-Ready Features** (October 2025):
    - **Idempotency Keys**: All POST requests use `X-Idempotency-Key` headers to prevent duplicate orders during network retries
    - **Correlation IDs**: Full request tracing from price calculation → claim creation → status updates
    - **Exponential Backoff with Jitter**: Automatic retry logic for 5xx errors with exponential delay and random jitter
    - **Pre-flight Validation**: Coordinates and package dimensions validated before API calls
    - **Structured Logging**: Detailed logs with correlation IDs, request IDs, service names, and operation types
    - **Smart Fallback**: Automatic failover between Yandex Go and Yandex Dostavka when one service is unavailable
    - **Utilities Module**: `server/utils/yandex-integration.ts` provides reusable functions for production-grade integration

### System Design Choices
- **Database**: PostgreSQL with Drizzle ORM for storing all application data, including users, products, orders, and gamification data.
- **Image Management**: Replit Object Storage for product and category images, with secure admin-only uploads via presigned URLs.
- **Microservices**: Though not explicitly stated as microservices, the architecture implies a clear separation between frontend, backend, and external dependencies.

## External Dependencies

1.  **Telegram WebApp Platform**: For native app hosting, authentication, and UI/UX integration.
2.  **OpenRouter AI API**: Powers the AI product assistant (Anthropic Claude 3 Haiku) for recommendations.
3.  **YooKassa Payment Gateway**: For online payment processing, supporting various Russian payment methods and 54-ФЗ compliance.
4.  **Yandex Dostavka API v2**: Express courier delivery service (https://b2b.taxi.yandex.net) with real-time tracking, pricing estimates, and automated order management. **Token source**: Yandex Delivery Corporate Dashboard → Интеграции → Получить токен. **Secret**: `YANDEX_DOSTAVKA_TOKEN`.
5.  **Yandex Go Доставка для бизнеса**: Business cargo delivery service (https://b2b.taxi.yandex.net/b2b/cargo/integration/v2/) with flexible requirements and real-time tracking. **CRITICAL**: This is **Yandex Cargo API** (delivery merci), NOT Yandex Taxi Business API (trasporto persone su https://b2b-api.go.yandex.ru). **IMPORTANT**: Yandex Go and Yandex Dostavka use the **SAME Cargo API endpoints** but **SEPARATE tokens** for different taxi classes (Yandex Go: express/auto, Yandex Dostavka: courier/foot). **Authentication (Updated Nov 2025)**: Supports dual-mode authentication - OAuth Client Credentials flow (YANDEX_GO_CLIENT_ID + YANDEX_GO_CLIENT_SECRET) or Static API Token (YANDEX_GO_TOKEN - preferred for simplicity). **Token source**: Яндекс Go Доставка для бизнеса cabinet (CARGO, not Taxi Business) → Интеграция → Create API token. Token must be from cargo/delivery service, not taxi/ride service. **Secrets**: `YANDEX_GO_TOKEN` (static Bearer token - recommended), optionally `YANDEX_GO_CLIENT_ID` and `YANDEX_GO_CLIENT_SECRET` for OAuth flow. **API Endpoints**: Same as Yandex Dostavka - `POST /v2/offers/calculate` for pricing, `POST /v2/claims/create` for order creation, `POST /v2/claims/info` for status retrieval, `POST /v2/claims/cancel` for cancellation. **Webhook Support**: Automatic status updates via `/api/webhooks/yandex-go` endpoint with HMAC SHA256 signature verification using `YANDEX_WEBHOOK_SECRET` and raw body parsing via express.raw() middleware. **Error Handling**: 403/401 errors indicate token is invalid or from wrong service - must use cargo/delivery token, not taxi/ride token. Clear Italian error messages guide users to correct configuration. **Production Features**: Idempotency keys for duplicate prevention, exponential backoff with jitter for retries, correlation IDs for full request tracing, automatic callback URL configuration for real-time updates, timing-safe signature comparison with buffer length validation. **Validation**: Backend validates pickup and delivery coordinates to ensure they are non-null and not [0,0] before calling API, returning user-friendly Italian error messages if validation fails.
6.  **Meta WhatsApp Business Platform (Cloud API)**: Direct integration with WhatsApp Business API for order notifications. **Implementation**: `server/services/whatsapp.ts` provides functions for sending order confirmations, status updates, and payment links via WhatsApp templates. **Cost Model**: FREE for service conversations (24-hour customer service window). Notifications sent as replies to customer-initiated messages are completely free and unlimited (effective November 1, 2024). **Authentication**: Requires `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN` from Meta for Developers. **Template System**: All business-initiated messages use pre-approved templates created in Meta Business Manager. **Setup Guide**: See `WHATSAPP_SETUP_GUIDE.md` for complete configuration instructions. **Integration Points**: Automatically sends WhatsApp notifications on order creation, status changes, and payment link generation (parallel to Telegram and email notifications).
7.  **DaData.ru Address Autocomplete**: For Russian address validation and standardization.
8.  **Resend Email API**: For transactional email notifications. Sends order confirmations to customers (if email provided) and new order notifications to managers. **Important**: In sandbox mode, can only send to verified owner address; requires domain verification for production use. **Secrets**: `RESEND_API_KEY` and `MANAGER_EMAILS` (comma-separated list).
9.  **Neon Database**: Serverless PostgreSQL hosting.
10. **NPM Dependencies**: Libraries for UI (Radix UI, Tailwind CSS), forms (react-hook-form, Zod), and data persistence (Drizzle ORM).
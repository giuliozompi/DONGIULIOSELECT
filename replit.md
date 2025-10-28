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
  - **Yandex Go**: General taxi-based delivery service (API v2 via http://b2b-api.go.yandex.ru) with features:
    - Real-time price calculation with cargo specifications (size, weight)
    - Flexible delivery options with customizable requirements (taxi class, cargo type)
    - Independent tracking system with separate claim IDs and status fields
    - Courier acceptance workflow with real-time status updates
    - Dedicated admin button and status badge
  - **Shared Infrastructure**:
    - Pick-up Address Management: Admins can save multiple pick-up addresses with full DaData integration for address validation and GPS coordinate extraction
    - Automatic Coordinate Calculation: GPS coordinates for both pickup and delivery locations are automatically extracted from DaData API responses
    - Both services support claim cancellation, info retrieval, and real-time performer tracking

### System Design Choices
- **Database**: PostgreSQL with Drizzle ORM for storing all application data, including users, products, orders, and gamification data.
- **Image Management**: Replit Object Storage for product and category images, with secure admin-only uploads via presigned URLs.
- **Microservices**: Though not explicitly stated as microservices, the architecture implies a clear separation between frontend, backend, and external dependencies.

## External Dependencies

1.  **Telegram WebApp Platform**: For native app hosting, authentication, and UI/UX integration.
2.  **OpenRouter AI API**: Powers the AI product assistant (Anthropic Claude 3 Haiku) for recommendations.
3.  **YooKassa Payment Gateway**: For online payment processing, supporting various Russian payment methods and 54-ФЗ compliance.
4.  **Yandex Dostavka API v2**: Express courier delivery service (https://b2b.taxi.yandex.net) with real-time tracking, pricing estimates, and automated order management. **Token source**: Yandex Delivery Corporate Dashboard → Интеграции → Получить токен. **Secret**: `YANDEX_DOSTAVKA_TOKEN`.
5.  **Yandex Go API v2**: General taxi-based delivery service (http://b2b-api.go.yandex.ru) with cargo delivery, flexible requirements, and real-time courier tracking. **Token Configuration**: Yandex Dostavka and Yandex Go use **different API endpoints** and require **separate authentication tokens** with different permissions. Yandex Go uses `YANDEX_GO_TOKEN` with endpoint `http://b2b-api.go.yandex.ru`, while Yandex Dostavka uses `YANDEX_DOSTAVKA_TOKEN` with endpoint `https://b2b.taxi.yandex.net`. **Token source**: Yandex Delivery Corporate Dashboard → Интеграции → Получить токен. **Response Parsing**: Yandex API returns nested price objects (`{total_price, total_price_with_vat, surge_ratio, currency}`) and time intervals (`pickup_interval`, `delivery_interval`) which are extracted and formatted by the backend before display. **Validation**: Backend validates pickup and delivery coordinates to ensure they are non-null and not [0,0] before calling API, returning user-friendly Italian error messages if validation fails.
6.  **DaData.ru Address Autocomplete**: For Russian address validation and standardization.
7.  **Neon Database**: Serverless PostgreSQL hosting.
8.  **NPM Dependencies**: Libraries for UI (Radix UI, Tailwind CSS), forms (react-hook-form, Zod), and data persistence (Drizzle ORM).
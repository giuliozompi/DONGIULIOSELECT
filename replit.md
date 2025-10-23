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
- **Admin Panel**: Sidebar-based interface with role-based access for managing categories, products, orders, clients, and recommendations. Includes search, filtering, and detailed views with editing capabilities. Master Admin can delete orders with cascade deletion of related logs.
- **Product Marking System**: Ensures regulatory compliance by tracking unique marking codes for unit-based products, integrated with a sequential acquisition workflow optimized for scanner operators. Features real-time validation, duplicate handling, and an audit trail. Smart auto-open logic: маркировка dialog opens automatically only when codes are incomplete; manual "Маркировка" button always available for viewing/acquiring codes. Saved codes are fully editable: click any field to modify, re-validate, and save updates (old codes are automatically deleted).
- **Gamification**: A fortune wheel system that automatically rewards users with spin tokens upon order completion, with idempotent and race-safe token assignment.
- **Payment Flow**: Supports YooKassa Online Payment (with 54-ФЗ compliance and marking code transmission) and Cash on Delivery. Online payment links are sent after order preparation.

### System Design Choices
- **Database**: PostgreSQL with Drizzle ORM for storing all application data, including users, products, orders, and gamification data.
- **Image Management**: Replit Object Storage for product and category images, with secure admin-only uploads via presigned URLs.
- **Microservices**: Though not explicitly stated as microservices, the architecture implies a clear separation between frontend, backend, and external dependencies.

## External Dependencies

1.  **Telegram WebApp Platform**: For native app hosting, authentication, and UI/UX integration.
2.  **OpenRouter AI API**: Powers the AI product assistant (Anthropic Claude 3 Haiku) for recommendations.
3.  **YooKassa Payment Gateway**: For online payment processing, supporting various Russian payment methods and 54-ФЗ compliance.
4.  **DaData.ru Address Autocomplete**: For Russian address validation and standardization.
5.  **Neon Database**: Serverless PostgreSQL hosting.
6.  **NPM Dependencies**: Libraries for UI (Radix UI, Tailwind CSS), forms (react-hook-form, Zod), and data persistence (Drizzle ORM).
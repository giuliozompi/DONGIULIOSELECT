# Don Giulio Select - Telegram Mini App

## Overview
Don Giulio Select is a Telegram Mini App functioning as an e-commerce platform for a premium Italian delicatessen. It offers a mobile-first shopping experience within Telegram, enabling users to browse products, manage their cart, make payments, receive AI-driven product recommendations, and engage with a gamified fortune wheel. The project aims to provide a seamless and engaging e-commerce solution within the Telegram ecosystem, built with React, Express.js, and integrated deeply with Telegram's WebApp API.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend uses **React 18**, TypeScript, **Wouter** for routing, and **TanStack Query v5** for server state. **Vite** is used for tooling. UI is built with **shadcn/ui** (Radix UI) and **Tailwind CSS**, adhering to a mobile-first design that synchronizes with Telegram's theme (day/night mode) using the **Telegram WebApp SDK** (`@twa-dev/sdk`).

### Backend
The backend is an **Express.js** application in TypeScript, providing a RESTful API for product management, cart logic, order processing, payments, gamification, and an AI assistant. Authentication uses Telegram WebApp init data verification and session-based security. An administrative panel with role-based access control allows management of categories, products, orders, and recommendations.

### Data Storage
**PostgreSQL** (Neon serverless) is the primary database, accessed via **Drizzle ORM**. It stores users, admins, product categories, products, shopping carts, orders (with delivery, discounts, and audit logs), user addresses, product associations for recommendations, payment intents, and gamification data. Orders support four delivery methods: Yandex Go, CDEK, Don Giulio courier, and self-pickup. User addresses can be saved and labeled. Customer contact information from checkout forms is automatically saved for future pre-filling. Products can have informational taste variations used for display, search, and AI recommendations.

### User Profile & Personal Cabinet (ЛК)
A "Personal Cabinet" (ЛК) accessible from the bottom navigation (always the last item) serves as a central hub. It includes:
- **Мои данные** (`/my-data`): View and edit user full name, phone, and email.
- **Мои избранные** (`/favorites`): User's favorite products.
- **Заказы** (`/orders`): Order history.
All fields support null values for deletion, and updates use PUT `/api/user`.

### Admin Panel
A sidebar-based admin interface (`/admin`) offers a two-tier administration model:
- **Master Administrator**: Full privileges, including managing other administrators (defined by `MASTER_ADMIN_USER_ID`).
- **Regular Administrators**: Manage categories, products, orders, and recommendations.
The panel includes sections for Catalog Management (Categories, Products, Recommendations) and Operations Management (Orders), plus "Администраторы" (Master Admin only) and "Логи" (Audit Logs). All administrative actions are tracked in `admin_action_logs` for accountability.

**UX Improvements (October 2025)**:
- Sidebar opens automatically when accessing `/admin` (`defaultOpen={true}`)
- Sidebar closes after selecting a navigation item to give full space to the content
- **Default Section**: Admin panel opens directly to "Заказы" (Orders) section by default
- **Cards Grid Layout**: Categories and Products display as responsive card grids (1 column mobile, 2 columns tablet/desktop max) with HomePage-style design (image background, dark gradient overlay, white text overlaid)
- **Separate Edit Pages**: Dedicated edit pages at `/admin/categories/:id` and `/admin/products/:id` instead of inline forms
- **Clean Navigation**: Click card or "Редактировать" button → navigate to edit page → save → return to admin grid
- Categories and Products creation still uses inline forms that appear on "Nuovo" button click
- Edit forms pre-populate with existing data and feature back/save buttons for navigation
- Cleaner, less cluttered interface with better separation between list view and edit operations

### Image Management & Object Storage
**Replit Object Storage** is used for product and category images. It features secure admin-only uploads with public accessibility. Uploads are handled via presigned URLs and an Uppy-based frontend component, with images served via a custom route. All uploads are restricted to 5MB, images only, and stored with normalized paths.

### Product Image Slideshow
Products support multiple images that automatically rotate in both list views and detail pages. The slideshow system features:
- **Auto-rotation**: 5-second intervals for automatic image transitions
- **Smooth transitions**: 1-second opacity fade between images
- **Infinite loop**: Seamlessly cycles through all product images
- **Manual controls**: Users can navigate images using prev/next buttons or indicators (in ProductGallery)
- **Fallback handling**: Single-image products display statically without slideshow
- **Memory safe**: Intervals properly cleaned up on component unmount

## External Dependencies

1.  **Telegram WebApp Platform**: Provides native app hosting, authentication, and UI/UX integration.
2.  **OpenRouter AI API**: Powers the AI product assistant (Anthropic Claude 3 Haiku). It features four professional roles (Cheese Sommelier, Meat Expert, Product Expert, Wine Sommelier), is multilingual, and prioritizes catalog products for recommendations.
3.  **SBP (Sistema di Pagamenti Veloci) Payment Gateway**: Integrated for payment processing (mock service currently).
4.  **DaData.ru Address Autocomplete**: Used for Russian address validation, standardization, and autocomplete.
5.  **Neon Database**: Serverless PostgreSQL hosting.
6.  **NPM Dependencies**: Libraries for UI (Radix UI, Tailwind CSS), forms (react-hook-form, Zod), data persistence (Drizzle ORM), and various utilities.
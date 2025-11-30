# Tawfir Backend API

Node.js/Express backend with TypeScript and PostgreSQL for the Tawfir platform.

## Prerequisites

- Node.js (v18 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up PostgreSQL Database

1. Create a PostgreSQL database:
```sql
CREATE DATABASE tawfir_db;
```

2. Update the `.env` file with your database credentials:
```bash
cp .env.example .env
```

Edit `.env` and update:
- `DB_HOST` - PostgreSQL host (default: localhost)
- `DB_PORT` - PostgreSQL port (default: 5432)
- `DB_NAME` - Database name (default: tawfir_db)
- `DB_USER` - PostgreSQL username
- `DB_PASSWORD` - PostgreSQL password

### 3. Run Database Migrations

Run all migrations to create the database schema:

```bash
npm run migrate
```

Or use the TypeScript migration runner:
```bash
npx tsx scripts/run-migrations.ts
```

### 4. Start Development Server

```bash
npm run dev
```

The server will start on `http://localhost:8000`

### 5. Verify Setup

Check the health endpoint:
```bash
curl http://localhost:8000/api/health
```

You should see:
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Database Schema

The database includes the following tables:

### Core Tables
- `users` - User accounts (customers, restaurant owners, admins)
- `roles` - User roles
- `permissions` - System permissions
- `role_user` - User-role relationships
- `permission_user` - User-permission relationships
- `permission_role` - Role-permission relationships

### Restaurant & Menu
- `restaurants` - Restaurant information
- `food_categories` - Food category definitions
- `food_category_restaurant` - Restaurant-category relationships
- `dishes` - Menu items/dishes
- `food_category_dish` - Dish-category relationships

### Orders & Payments
- `carts` - Shopping cart items
- `orders` - Customer orders
- `order_items` - Order line items
- `transactions` - Payment transactions
- `wallet_transactions` - Wallet credit/debit transactions
- `withdrawal_requests` - Restaurant withdrawal requests

### Other
- `notifications` - System notifications
- `password_reset_tokens` - Password reset tokens
- `personal_access_tokens` - API authentication tokens
- `failed_jobs` - Failed queue jobs

## Project Structure

```
backend/
├── src/
│   ├── config/
│   │   └── database.ts       # PostgreSQL connection pool
│   ├── controllers/          # Route controllers (to be added)
│   ├── models/              # Database models (to be added)
│   ├── routes/              # API routes (to be added)
│   ├── middleware/          # Express middleware (to be added)
│   ├── utils/               # Utility functions (to be added)
│   └── index.ts             # Express app entry point
├── migrations/              # SQL migration files
├── scripts/                 # Utility scripts
├── dist/                    # Compiled JavaScript (generated)
└── package.json
```

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Compile TypeScript to JavaScript
- `npm run start` - Start production server
- `npm run migrate` - Run database migrations (using node-pg-migrate)
- `npx tsx scripts/run-migrations.ts` - Run migrations using TypeScript script

## Environment Variables

See `.env.example` for all available environment variables.

## API Endpoints

API endpoints will be added as the backend is developed. The base URL is:
- Development: `http://localhost:8000/api`
- Production: (to be configured)

## Notes

- All timestamps use PostgreSQL's `TIMESTAMP` type
- JSON fields use PostgreSQL's `JSONB` type for better performance
- Foreign keys use `ON DELETE CASCADE` for data integrity
- The `updated_at` column is automatically updated via database triggers
- Soft deletes are supported on `users` and `orders` tables via `deleted_at` column


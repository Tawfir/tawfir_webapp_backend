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

### 2. Set Up Databases

#### 2a: Postgres SQL Database

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

#### 2b: AWS S3 Buckets

You can follow the instructions to setup the AWS S3 Buckets with this [link](./S3_SETUP.md). 

### 3. Run Database Migrations

Run all migrations to create the database schema:

```bash
npm run migrate
```

Or use the TypeScript migration runner:
```bash
npx tsx scripts/run-migrations.ts
```

### 4. Seed the Database (Optional but Recommended)

Populate the database with initial test data (users, restaurants, dishes, orders):

```bash
npm run seed
```

This will create:
- **Admin user**: `admin@example.com` / `password`
- **Normal user**: `user@example.com` / `password`
- **Restaurant user**: `restaurant@example.com` / `password`
- **1 approved restaurant** with sample dishes
- **22 sample orders** (6 incoming, 4 ready, 12 completed)
- **6 food categories**

**Note:** The seeder uses `ON CONFLICT` clauses where possible, so you can run it multiple times safely. It will update existing records if they exist.

### 5. Start Development Server

```bash
npm run dev
```

The server will start on `http://localhost:8080`

### 6. Verify Setup

Check the health endpoint:
```bash
curl http://localhost:8080/api/health
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


## API Documentation (Swagger UI)

All API endpoints and their descriptions are available via Swagger UI when the server is running:

- **Development:** `http://localhost:8080/api-docs`
- **Production:** `https://your-api-url.com/api-docs`

This is where you can see all the API endpoints and descriptions. The Swagger UI provides:
- Complete list of all available API endpoints
- Detailed endpoint descriptions and parameters
- Request/response schemas
- Try-it-out functionality for testing endpoints
- Authentication information



## Notes

- All timestamps use PostgreSQL's `TIMESTAMP` type
- JSON fields use PostgreSQL's `JSONB` type for better performance
- Foreign keys use `ON DELETE CASCADE` for data integrity
- The `updated_at` column is automatically updated via database triggers
- Soft deletes are supported on `users` and `orders` tables via `deleted_at` column


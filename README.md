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

You can follow the instructions to setup the PostGres SQL Database with this [link](./DATABASE_SETUP.md). 

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


For production it's recommended not to populate the database with all this mock data, but you can populate just the users for demo purposes: 
```bash
npm run seed:users
```

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

# Database Setup Guide

## Production Setup: Supabase 

### Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) → Sign up (free)
2. Click "New Project"
3. Fill in:
   - **Name**: `tawfir-production`
   - **Database Password**: Create a strong password (save it!)
   - **Region**: Choose closest to you
   - **Pricing Plan**: Free
4. Click "Create new project"

### Step 2: Get Connection String (Transaction Pooler)

1. Go to **Settings** → **Database**
2. Scroll to **Connection string**
3. **Important**: Select these options:
   - **Type**: URI
   - **Source**: Primary Database
   - **Method**: Transaction pooler
4. Copy the connection string (it looks like):
   ```
   postgresql://postgres.xxxxx:your-password@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   ```
5. Replace `[YOUR-PASSWORD]` with your actual password

### Step 3: Run Migrations

**Windows (PowerShell):**
```powershell
cd tawfir_webapp_backend

# Set the connection string (use Transaction Pooler URL from Supabase)
$env:DATABASE_URL="postgresql://postgres.xxxxx:your-password@aws-0-us-east-1.pooler.supabase.com:6543/postgres"

# Run migrations
npm run migrate
```

**Mac/Linux (Bash):**
```bash
cd tawfir_webapp_backend

# Set the connection string (use Transaction Pooler URL from Supabase)
export DATABASE_URL="postgresql://postgres.xxxxx:your-password@aws-0-us-east-1.pooler.supabase.com:6543/postgres"

# Run migrations
npm run migrate
```

You should see all migrations running successfully.





## Local Development: PostgreSQL with pgAdmin4

For local development, use PostgreSQL on your machine with pgAdmin4.

### Step 1: Install PostgreSQL

1. Download PostgreSQL from [postgresql.org/download](https://www.postgresql.org/download/)
2. Install PostgreSQL (includes pgAdmin4)
3. During installation, set a password for the `postgres` user (remember this!)

### Step 2: Create Database in pgAdmin4

1. Open **pgAdmin4** (installed with PostgreSQL)
2. Connect to your local server (password from installation)
3. Right-click **Databases** → **Create** → **Database**
4. Fill in:
   - **Database name**: `tawfir_db`
   - Click **Save**

### Step 3: Configure Local Environment

1. In `tawfir_webapp_backend`, create/update `.env` file:
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=tawfir_db
   DB_USER=postgres
   DB_PASSWORD=your-postgres-password
   ```

2. **Don't set** `DATABASE_URL` in `.env` (leave it for production only)

### Step 4: Run Migrations Locally

```bash
cd tawfir_webapp_backend
npm run migrate
```

This will create all tables in your local database.

### Step 5: (Optional) Seed Local Database

```bash
npm run seed
```

This populates your local database with test data.


## .env Summary

**Production (Supabase):**
```powershell
$env:DATABASE_URL="postgresql://postgres.xxxxx:password@pooler.supabase.com:6543/postgres"
npm run migrate
```

**Local Development:**
```env
# .env file
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tawfir_db
DB_USER=postgres
DB_PASSWORD=your-password
```

The backend automatically uses `DATABASE_URL` if set, otherwise falls back to `DB_*` variables for local development.


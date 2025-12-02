import { Pool, PoolConfig } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Support both DATABASE_URL (production) and individual variables (development)
let dbConfig: PoolConfig;

if (process.env.DATABASE_URL) {
  // Production: Use connection string (from Vercel, Railway, etc.)
  console.log('🔗 Using DATABASE_URL connection string');
  console.log('📍 Host:', process.env.DATABASE_URL.match(/@([^:]+)/)?.[1] || 'unknown');
  
  // Parse connection string to check if it's a pooler (port 6543) or direct (port 5432)
  const isPooler = process.env.DATABASE_URL.includes(':6543') || process.env.DATABASE_URL.includes('pooler');
  
  // For connection strings, SSL is handled via the connection string itself
  // But we also need to explicitly set SSL config for the pg library
  dbConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false, // Allow self-signed certificates (required for Supabase pooler)
    },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000, // Increased timeout for network issues
  };
} else {
  // Development: Use individual variables
  console.log('🔗 Using individual DB_* variables (localhost)');
  dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'tawfir_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };
}

const pool = new Pool(dbConfig);

// Error codes that indicate the object already exists (safe to ignore)
const IGNORABLE_ERROR_CODES = [
  '42710', // duplicate_object - object already exists
  '42P07', // duplicate_table - table already exists
  '42P16', // invalid_table_definition - but sometimes used for existing objects
];

function isIgnorableError(error: any): boolean {
  if (!error || !error.code) return false;
  return IGNORABLE_ERROR_CODES.includes(error.code);
}

async function runMigrations() {
  const migrationsDir = join(__dirname, '../migrations');
  const fs = require('fs');
  const files = fs.readdirSync(migrationsDir)
    .filter((file: string) => file.endsWith('.sql'))
    .sort();

  console.log(`📦 Found ${files.length} migration files`);

  for (const file of files) {
    const filePath = join(migrationsDir, file);
    const sql = readFileSync(filePath, 'utf-8');
    
    console.log(`🔄 Running migration: ${file}`);
    
    try {
      await pool.query(sql);
      console.log(`✅ Completed: ${file}`);
    } catch (error: any) {
      // Check if it's an "already exists" error that we can safely ignore
      if (isIgnorableError(error)) {
        console.log(`⚠️  Warning in ${file}: ${error.message}`);
        console.log(`   (Object already exists, skipping...)`);
        continue;
      }
      
      // For other errors, check if it's a trigger/function that already exists
      const errorMessage = error.message?.toLowerCase() || '';
      if (
        errorMessage.includes('already exists') &&
        (errorMessage.includes('trigger') || 
         errorMessage.includes('function') ||
         errorMessage.includes('index') ||
         errorMessage.includes('constraint'))
      ) {
        console.log(`⚠️  Warning in ${file}: ${error.message}`);
        console.log(`   (Object already exists, skipping...)`);
        continue;
      }
      
      // For serious errors, throw
      console.error(`❌ Error in ${file}:`, error);
      throw error;
    }
  }

  console.log('✨ All migrations completed successfully!');
  await pool.end();
}

runMigrations().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});


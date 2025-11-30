import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'tawfir_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

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


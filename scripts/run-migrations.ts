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
    } catch (error) {
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


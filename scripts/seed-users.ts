/**
 * Production User Seeder
 * Creates only essential users (admin and restaurant) for production
 */

import { pool } from '../src/config/database';
import bcrypt from 'bcryptjs';

const users = [
  {
    name: 'Admin User',
    email: 'admin@example.com',
    type: 'admin',
    password: 'password', // Change this in production!
    phone: '+1234567890',
  },
  {
    name: 'Restaurant Owner',
    email: 'restaurant@example.com',
    type: 'restaurant',
    password: 'password', // Change this in production!
    phone: '+1234567892',
  },
];

async function seedUsers() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('🌱 Starting user seeding (production)...\n');

    console.log('📝 Creating users...');
    const userIds: Record<string, number> = {};

    for (const userData of users) {
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      
      const result = await client.query(
        `INSERT INTO users (name, email, phone, password, type, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (email) DO UPDATE SET
           name = EXCLUDED.name,
           phone = EXCLUDED.phone,
           password = EXCLUDED.password,
           type = EXCLUDED.type,
           updated_at = NOW()
         RETURNING id, email, type`,
        [userData.name, userData.email, userData.phone || null, hashedPassword, userData.type]
      );

      const user = result.rows[0];
      userIds[userData.type] = user.id;
      console.log(`   ✓ Created ${userData.type} user: ${userData.email} (ID: ${user.id})`);
    }

    await client.query('COMMIT');

    console.log('\n✅ User seeding completed successfully!');
    console.log('\n📋 Login Credentials:');
    console.log('   Admin:      admin@example.com / password');
    console.log('   Restaurant: restaurant@example.com / password');
    console.log('\n⚠️  IMPORTANT: Change these passwords in production!');
    console.log('');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error seeding users:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run seeder
seedUsers()
  .then(() => {
    console.log('✨ User seeding process finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 User seeding failed:', error);
    process.exit(1);
  });


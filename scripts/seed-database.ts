/**
 * Database Seeder
 * Populates the database with initial data for testing
 */

import { pool } from '../src/config/database';
import bcrypt from 'bcryptjs';

interface SeedData {
  users: Array<{
    name: string;
    email: string;
    type: string;
    password: string;
    phone?: string;
  }>;
  categories: Array<{
    name: string;
    slug: string;
  }>;
  restaurant: {
    name: string;
    address: string;
    lat: number;
    lng: number;
    public_phone: string;
    private_phone: string;
  };
  dishes: Array<{
    name: string;
    price: number;
    discounted_price: number;
    quantity: number;
    pickup_time: string;
    category_id: number;
    description?: string;
    co2_saved?: number;
  }>;
}

const seedData: SeedData = {
  users: [
    {
      name: 'Admin User',
      email: 'admin@example.com',
      type: 'admin',
      password: 'password',
      phone: '+1234567890',
    },
    {
      name: 'Normal User',
      email: 'user@example.com',
      type: 'user',
      password: 'password',
      phone: '+1234567891',
    },
    {
      name: 'Restaurant Owner',
      email: 'restaurant@example.com',
      type: 'restaurant',
      password: 'password',
      phone: '+1234567892',
    },
  ],
  categories: [
    { name: 'Burgers', slug: 'burgers' },
    { name: 'Salads & Bowls', slug: 'salads-bowls' },
    { name: 'Drinks', slug: 'drinks' },
    { name: 'Desserts', slug: 'desserts' },
    { name: 'Hot Meals', slug: 'hot-meals' },
    { name: 'Sandwiches & Wraps', slug: 'sandwiches-wraps' },
  ],
  restaurant: {
    name: 'Tawfir Restaurant',
    address: '123 Test Street',
    lat: 24.7136,
    lng: 46.6753,
    public_phone: '0500000000',
    private_phone: '0550000000',
  },
  dishes: [
    // Sandwiches & Wraps (category_id: 6, will be set after categories are created)
    { name: 'Chicken Sandwhich', price: 10.00, discounted_price: 5.00, quantity: 5, pickup_time: '22:00', category_id: 6, description: 'Delicious chicken sandwich', co2_saved: 2.5 },
    { name: 'Falafel Sandwhich', price: 10.00, discounted_price: 5.00, quantity: 10, pickup_time: '10:00', category_id: 6, description: 'Fresh falafel sandwich', co2_saved: 2.0 },
    
    // Drinks (category_id: 3)
    { name: 'Fresh Orange Juice', price: 5.00, discounted_price: 2.50, quantity: 0, pickup_time: '20:00', category_id: 3, description: 'Freshly squeezed orange juice', co2_saved: 0.5 },
    { name: 'Iced Latte', price: 15.00, discounted_price: 7.50, quantity: 5, pickup_time: '20:30', category_id: 3, description: 'Cold iced latte', co2_saved: 1.0 },
    
    // Desserts (category_id: 4)
    { name: 'Chocolate Mousse', price: 15.00, discounted_price: 7.50, quantity: 0, pickup_time: '21:30', category_id: 4, description: 'Rich chocolate mousse', co2_saved: 1.5 },
    { name: 'Cheesecake', price: 10.00, discounted_price: 5.00, quantity: 0, pickup_time: '21:30', category_id: 4, description: 'Classic cheesecake', co2_saved: 1.2 },
    
    // Burgers (category_id: 1)
    { name: 'Chicken Burger', price: 20.00, discounted_price: 10.00, quantity: 0, pickup_time: '18:00', category_id: 1, description: 'Juicy chicken burger', co2_saved: 3.0 },
    { name: 'Veggie Burger', price: 15.00, discounted_price: 7.50, quantity: 4, pickup_time: '18:00', category_id: 1, description: 'Plant-based veggie burger', co2_saved: 2.5 },
    
    // Hot Meals (category_id: 5)
    { name: 'Mac & Cheese Pasta', price: 20.00, discounted_price: 10.00, quantity: 30, pickup_time: '22:00', category_id: 5, description: 'Creamy mac and cheese', co2_saved: 4.0 },
    { name: 'Chicken Biryani', price: 15.00, discounted_price: 7.50, quantity: 10, pickup_time: '21:00', category_id: 5, description: 'Spiced chicken biryani', co2_saved: 3.5 },
    
    // Salads & Bowls (category_id: 2)
    { name: 'Chicken Ceasar Salad', price: 20.00, discounted_price: 10.00, quantity: 5, pickup_time: '20:00', category_id: 2, description: 'Classic Caesar salad with chicken', co2_saved: 2.0 },
    { name: 'Quinoa Veg Salad', price: 15.00, discounted_price: 7.50, quantity: 0, pickup_time: '20:00', category_id: 2, description: 'Healthy quinoa and vegetable salad', co2_saved: 1.8 },
  ],
};

async function seedDatabase() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('🌱 Starting database seeding...\n');

    // 1. Create Users
    console.log('📝 Creating users...');
    const userIds: Record<string, number> = {};

    for (const userData of seedData.users) {
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

    // 2. Create Food Categories
    console.log('\n🍽️  Creating food categories...');
    const categoryIds: Record<string, number> = {};

    for (const categoryData of seedData.categories) {
      const result = await client.query(
        `INSERT INTO food_categories (name, slug, created_at, updated_at)
         VALUES ($1, $2, NOW(), NOW())
         ON CONFLICT (slug) DO UPDATE SET
           name = EXCLUDED.name,
           updated_at = NOW()
         RETURNING id, name, slug`,
        [categoryData.name, categoryData.slug]
      );

      const category = result.rows[0];
      categoryIds[categoryData.slug] = category.id;
      console.log(`   ✓ Created category: ${categoryData.name} (ID: ${category.id})`);
    }

    // 3. Create Restaurant
    console.log('\n🏪 Creating restaurant...');
    // Check if restaurant already exists
    const existingRestaurant = await client.query(
      'SELECT id FROM restaurants WHERE user_id = $1',
      [userIds['restaurant']]
    );

    let restaurantId: number;
    if (existingRestaurant.rows.length > 0) {
      restaurantId = existingRestaurant.rows[0].id;
      // Update existing restaurant
      await client.query(
        `UPDATE restaurants SET
         name = $1, address = $2, lat = $3, lng = $4,
         public_phone = $5, private_phone = $6,
         status = $7, is_featured = $8, updated_at = NOW()
         WHERE id = $9`,
        [
          seedData.restaurant.name,
          seedData.restaurant.address,
          seedData.restaurant.lat,
          seedData.restaurant.lng,
          seedData.restaurant.public_phone,
          seedData.restaurant.private_phone,
          'approved',
          true,
          restaurantId,
        ]
      );
      console.log(`   ✓ Updated restaurant: ${seedData.restaurant.name} (ID: ${restaurantId})`);
    } else {
      // Create new restaurant
      const newRestaurantResult = await client.query(
        `INSERT INTO restaurants (user_id, name, address, lat, lng, public_phone, private_phone, status, is_featured, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
         RETURNING id, name`,
        [
          userIds['restaurant'],
          seedData.restaurant.name,
          seedData.restaurant.address,
          seedData.restaurant.lat,
          seedData.restaurant.lng,
          seedData.restaurant.public_phone,
          seedData.restaurant.private_phone,
          'approved',
          true,
        ]
      );
      restaurantId = newRestaurantResult.rows[0].id;
      console.log(`   ✓ Created restaurant: ${newRestaurantResult.rows[0].name} (ID: ${restaurantId})`);
    }

    // Link restaurant to categories
    const categorySlugMap: Record<number, string> = {
      1: 'burgers',
      2: 'salads-bowls',
      3: 'drinks',
      4: 'desserts',
      5: 'hot-meals',
      6: 'sandwiches-wraps',
    };

    for (const [dishCategoryId, slug] of Object.entries(categorySlugMap)) {
      const categoryId = categoryIds[slug];
      if (categoryId) {
        await client.query(
          `INSERT INTO food_category_restaurant (food_category_id, restaurant_id)
           VALUES ($1, $2)
           ON CONFLICT (food_category_id, restaurant_id) DO NOTHING`,
          [categoryId, restaurantId]
        );
      }
    }

    // 4. Create Dishes
    console.log('\n🍕 Creating dishes...');
    const dishIds: number[] = [];

    for (const dishData of seedData.dishes) {
      // Map category_id to actual category slug
      const categorySlug = categorySlugMap[dishData.category_id];
      const categoryId = categoryIds[categorySlug];

      if (!categoryId) {
        console.warn(`   ⚠️  Category ID ${dishData.category_id} not found, skipping dish: ${dishData.name}`);
        continue;
      }

      const result = await client.query(
        `INSERT INTO dishes (restaurant_id, name, description, price, discounted_price, quantity, availability_method, pickup_time, co2_saved, image, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
         RETURNING id, name`,
        [
          restaurantId,
          dishData.name,
          dishData.description || null,
          dishData.price,
          dishData.discounted_price,
          dishData.quantity,
          'pickup',
          dishData.pickup_time,
          dishData.co2_saved || null,
          'https://via.placeholder.com/300',
        ]
      );

      const dish = result.rows[0];
      dishIds.push(dish.id);

      // Link dish to category
      await client.query(
        `INSERT INTO food_category_dish (food_category_id, dish_id, created_at, updated_at)
         VALUES ($1, $2, NOW(), NOW())
         ON CONFLICT (food_category_id, dish_id) DO NOTHING`,
        [categoryId, dish.id]
      );

      console.log(`   ✓ Created dish: ${dish.name} (ID: ${dish.id})`);
    }

    // 5. Create Sample Orders
    console.log('\n📦 Creating sample orders...');
    const userId = userIds['user'];
    const pickupTimes = ['11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30'];
    
    // Delete existing orders for this restaurant to ensure fresh data for today
    await client.query('DELETE FROM orders WHERE restaurant_id = $1', [restaurantId]);
    console.log('   ✓ Cleared existing orders');
    
    // Get all dishes for orders
    const allDishesResult = await client.query(
      'SELECT id, price, discounted_price FROM dishes WHERE restaurant_id = $1',
      [restaurantId]
    );
    const allDishes = allDishesResult.rows;

    if (allDishes.length === 0) {
      console.log('   ⚠️  No dishes available, skipping order creation');
    } else {
      // Create orders for the last 3 days including today
      // Distribution: Today (most orders), Yesterday, Day before yesterday
      const orderGroups = [
        // Today's orders
        { status: 'incoming', count: 6, dayOffset: 0 },
        { status: 'ready', count: 4, dayOffset: 0 },
        { status: 'completed', count: 12, dayOffset: 0 },
        // Yesterday's orders
        { status: 'completed', count: 8, dayOffset: 1 },
        { status: 'cancelled', count: 2, dayOffset: 1 },
        // Day before yesterday's orders
        { status: 'completed', count: 6, dayOffset: 2 },
      ];

      let orderCount = 0;
      for (const group of orderGroups) {
        for (let i = 0; i < group.count; i++) {
          // Pick random dishes (1-4 dishes per order)
          const numberOfDishes = Math.floor(Math.random() * 4) + 1;
          const selectedDishes = allDishes
            .sort(() => Math.random() - 0.5)
            .slice(0, numberOfDishes);

          let totalPrice = 0;
          // Create orders for the specified day with random times throughout the day
          const now = new Date();
          const createdAt = new Date(now);
          // Subtract days
          createdAt.setDate(createdAt.getDate() - group.dayOffset);
          // Set random time between 9 AM and 11 PM
          createdAt.setHours(9 + Math.floor(Math.random() * 14), Math.floor(Math.random() * 60), 0, 0);

          // Random payment method (card or cash) for completed orders
          // For other statuses, set payment_method to null (will be set when order is completed)
          const paymentMethod = group.status === 'completed' 
            ? (Math.random() > 0.5 ? 'card' : 'cash')
            : null;

          // Create order
          const orderResult = await client.query(
            `INSERT INTO orders (user_id, restaurant_id, status, payment_method, pickup_time, total_price, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
             RETURNING id`,
            [
              userId,
              restaurantId,
              group.status,
              paymentMethod,
              pickupTimes[Math.floor(Math.random() * pickupTimes.length)],
              0, // Will update after
              createdAt,
            ]
          );

          const orderId = orderResult.rows[0].id;

          // Create order items
          for (const dish of selectedDishes) {
            const quantity = Math.floor(Math.random() * 3) + 1;
            const price = dish.discounted_price || dish.price;
            const itemTotal = price * quantity;
            totalPrice += itemTotal;

            await client.query(
              `INSERT INTO order_items (order_id, dish_id, quantity, price_at_order_time, created_at, updated_at)
               VALUES ($1, $2, $3, $4, NOW(), NOW())`,
              [orderId, dish.id, quantity, price]
            );
          }

          // Update order with total price
          await client.query(
            'UPDATE orders SET total_price = $1 WHERE id = $2',
            [totalPrice, orderId]
          );

          // For completed orders, create transaction and credit wallet
          if (group.status === 'completed') {
            // Create transaction
            const transactionResult = await client.query(
              `INSERT INTO transactions (order_id, user_id, amount_cents, currency, type, method, status, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
               RETURNING id`,
              [
                orderId,
                userId,
                Math.round(totalPrice * 100),
                'usd',
                'payment',
                paymentMethod || 'cash',
                'succeeded',
              ]
            );

            // Credit restaurant wallet (after 7.5% service fee)
            const serviceFeePercent = 7.5;
            const serviceFee = (totalPrice * serviceFeePercent) / 100;
            const netToRestaurant = totalPrice - serviceFee;

            await client.query(
              `INSERT INTO wallet_transactions (walletable_id, walletable_type, type, amount, description, order_id, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
              [
                restaurantId,
                'restaurant',
                'credit',
                netToRestaurant,
                `Order #${orderId} payment received (net of ${serviceFeePercent}% fee)`,
                orderId,
              ]
            );
          }

          orderCount++;
        }
      }

      console.log(`   ✓ Created ${orderCount} orders`);
    }

    // 6. Create second restaurant with negative balance for testing
    console.log('\n🏪 Creating second restaurant with negative balance...');
    const secondRestaurantUserResult = await client.query(
      `SELECT id FROM users WHERE email = 'restaurant2@example.com'`
    );

    let secondRestaurantUserId: number;
    if (secondRestaurantUserResult.rows.length > 0) {
      secondRestaurantUserId = secondRestaurantUserResult.rows[0].id;
      console.log(`   ✓ Found existing user for second restaurant (ID: ${secondRestaurantUserId})`);
    } else {
      const hashedPassword2 = await bcrypt.hash('password', 10);
      const newUserResult = await client.query(
        `INSERT INTO users (name, email, password, type, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING id`,
        ['Second Restaurant Owner', 'restaurant2@example.com', hashedPassword2, 'restaurant']
      );
      secondRestaurantUserId = newUserResult.rows[0].id;
      
      // Add restaurant role
      const roleResult2 = await client.query('SELECT id FROM roles WHERE name = $1', ['restaurant']);
      if (roleResult2.rows.length > 0) {
        await client.query(
          'INSERT INTO role_user (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [secondRestaurantUserId, roleResult2.rows[0].id]
        );
      }
      console.log(`   ✓ Created user for second restaurant (ID: ${secondRestaurantUserId})`);
    }

    const secondRestaurantResult = await client.query(
      `SELECT id FROM restaurants WHERE user_id = $1`,
      [secondRestaurantUserId]
    );

    let secondRestaurantId: number;
    if (secondRestaurantResult.rows.length > 0) {
      secondRestaurantId = secondRestaurantResult.rows[0].id;
      console.log(`   ✓ Found existing second restaurant (ID: ${secondRestaurantId})`);
    } else {
      const newRestaurantResult = await client.query(
        `INSERT INTO restaurants (user_id, name, address, lat, lng, public_phone, private_phone, status, is_featured, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
         RETURNING id`,
        [
          secondRestaurantUserId,
          'Cash Only Restaurant',
          '456 Test Avenue',
          24.7500,
          46.7000,
          '0511111111',
          '0561111111',
          'approved',
          false,
        ]
      );
      secondRestaurantId = newRestaurantResult.rows[0].id;
      console.log(`   ✓ Created second restaurant (ID: ${secondRestaurantId})`);
    }

    // Create orders for second restaurant with cash payments (negative balance)
    const secondRestaurantOrdersResult = await client.query(
      `SELECT COUNT(*) as count FROM orders WHERE restaurant_id = $1`,
      [secondRestaurantId]
    );
    const existingSecondOrders = parseInt(secondRestaurantOrdersResult.rows[0].count);

    if (existingSecondOrders === 0) {
      // Create 5 completed cash orders for negative balance
      for (let i = 1; i <= 5; i++) {
        const orderDate = new Date();
        orderDate.setDate(orderDate.getDate() - i);
        orderDate.setHours(12 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60), 0, 0);

        await client.query(
          `INSERT INTO orders (user_id, restaurant_id, total_price, status, payment_method, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $6)`,
          [
            userId,
            secondRestaurantId,
            100.00,
            'completed',
            'cash',
            orderDate,
          ]
        );
      }
      console.log(`   ✓ Created 5 cash orders for second restaurant (negative balance)`);
    } else {
      console.log(`   ✓ Second restaurant already has ${existingSecondOrders} orders`);
    }

    await client.query('COMMIT');

    console.log('\n✅ Database seeding completed successfully!');
    console.log('\n📋 Login Credentials:');
    console.log('   Admin:              admin@example.com / password');
    console.log('   User:               user@example.com / password');
    console.log('   Restaurant:         restaurant@example.com / password');
    console.log('   Restaurant 2:       restaurant2@example.com / password');
    console.log('\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error seeding database:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run seeder
seedDatabase()
  .then(() => {
    console.log('✨ Seeding process finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Seeding failed:', error);
    process.exit(1);
  });


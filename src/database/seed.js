/**
 * Database Seed Script
 * Creates sample data for development
 * 
 * Run with: npm run seed
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'acceso_api',
  user: process.env.DB_USER || 'user',
  password: process.env.DB_PASSWORD || 'password',
});

async function seed() {
  console.log('🌱 Seeding database...\n');

  try {
    const client = await pool.connect();

    // Create test user
    const passwordHash = await bcrypt.hash('testpassword123', 12);
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, name, is_active, email_verified)
       VALUES ($1, $2, $3, true, true)
       ON CONFLICT (email) DO UPDATE SET name = $3
       RETURNING id`,
      ['test@acceso.dev', passwordHash, 'Test User']
    );
    const userId = userResult.rows[0].id;
    console.log(`✅ Created test user: test@acceso.dev (password: testpassword123)`);

    // Create API keys for different tiers
    const tiers = ['free', 'basic', 'pro', 'enterprise'];
    for (const tier of tiers) {
      const apiKey = `acc_${tier}_${Date.now().toString(36)}${Math.random().toString(36).substr(2, 20)}`;
      await client.query(
        `INSERT INTO api_keys (user_id, name, key_hash, key_prefix, tier)
         VALUES ($1, $2, crypt($3, gen_salt('bf')), $4, $5)
         ON CONFLICT DO NOTHING`,
        [userId, `${tier.charAt(0).toUpperCase() + tier.slice(1)} API Key`, apiKey, apiKey.substring(0, 12), tier]
      );
      console.log(`✅ Created ${tier} API key: ${apiKey}`);
    }

    // Create sample webhook
    await client.query(
      `INSERT INTO webhooks (user_id, name, url, events, secret)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [
        userId,
        'Sample Webhook',
        'https://webhook.site/test',
        JSON.stringify(['transaction.confirmed', 'workflow.completed']),
        'whsec_sample_secret_123'
      ]
    );
    console.log('✅ Created sample webhook');

    // Create sample workflow
    await client.query(
      `INSERT INTO workflows (user_id, name, description, trigger, conditions, actions)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING`,
      [
        userId,
        'Sample Price Alert',
        'Alert when market price crosses threshold',
        JSON.stringify({ type: 'price_threshold', config: { market_id: 'sample', threshold: 0.90 } }),
        JSON.stringify([]),
        JSON.stringify([{ type: 'webhook', config: { url: 'https://example.com/alert' } }])
      ]
    );
    console.log('✅ Created sample workflow');

    client.release();
    console.log('\n✅ Seeding completed successfully!\n');

  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  seed();
}

module.exports = { seed };

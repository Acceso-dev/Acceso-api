/**
 * Prisma Database Seed
 * Seeds the database with initial development data
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Create PostgreSQL connection pool
let connectionString = process.env.DATABASE_URL;
console.log('Connecting to:', connectionString ? 'Neon database (configured)' : 'ERROR: No DATABASE_URL');

if (!connectionString) {
  console.error('❌ DATABASE_URL is not set in .env file');
  process.exit(1);
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Starting database seed...\n');

  // Clean existing data
  console.log('Cleaning existing data...');
  await prisma.webhookDelivery.deleteMany();
  await prisma.webhook.deleteMany();
  await prisma.workflowExecution.deleteMany();
  await prisma.workflow.deleteMany();
  await prisma.usageMetrics.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.user.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.priceCache.deleteMany();
  await prisma.zkProof.deleteMany();
  await prisma.zkCircuit.deleteMany();
  await prisma.rateLimit.deleteMany();

  // Create test users
  console.log('Creating users...');
  const passwordHash = await bcrypt.hash('password123', 10);

  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@acceso.dev',
      name: 'Admin User',
      password: passwordHash,
      tier: 'ENTERPRISE',
      status: 'ACTIVE',
    },
  });

  const testUser = await prisma.user.create({
    data: {
      email: 'test@acceso.dev',
      name: 'Test User',
      password: passwordHash,
      tier: 'PRO',
      status: 'ACTIVE',
    },
  });

  const freeUser = await prisma.user.create({
    data: {
      email: 'free@acceso.dev',
      name: 'Free User',
      password: passwordHash,
      tier: 'FREE',
      status: 'ACTIVE',
    },
  });

  console.log(`  ✓ Created ${3} users`);

  // Create API keys with acceso_ prefix
  console.log('Creating API keys...');
  
  // Generate API keys with acceso_ prefix for branding
  const testApiKey = 'acceso_ent_' + crypto.randomBytes(24).toString('hex');
  const testKeyHash = crypto.createHash('sha256').update(testApiKey).digest('hex');

  const adminApiKey = await prisma.apiKey.create({
    data: {
      userId: adminUser.id,
      name: 'Admin API Key',
      keyHash: testKeyHash,
      keyPrefix: testApiKey.substring(0, 16),
      tier: 'ENTERPRISE',
      status: 'ACTIVE',
      permissions: ['read', 'write', 'admin'],
      rateLimit: 10000,
    },
  });

  const proApiKey = 'acceso_pro_' + crypto.randomBytes(24).toString('hex');
  const proKeyHash = crypto.createHash('sha256').update(proApiKey).digest('hex');

  await prisma.apiKey.create({
    data: {
      userId: testUser.id,
      name: 'Pro API Key',
      keyHash: proKeyHash,
      keyPrefix: proApiKey.substring(0, 16),
      tier: 'PRO',
      status: 'ACTIVE',
      permissions: ['read', 'write'],
      rateLimit: 1000,
    },
  });

  const freeApiKey = 'acceso_free_' + crypto.randomBytes(24).toString('hex');
  const freeKeyHash = crypto.createHash('sha256').update(freeApiKey).digest('hex');

  await prisma.apiKey.create({
    data: {
      userId: freeUser.id,
      name: 'Free API Key',
      keyHash: freeKeyHash,
      keyPrefix: freeApiKey.substring(0, 16),
      tier: 'FREE',
      status: 'ACTIVE',
      permissions: ['read'],
      rateLimit: 100,
    },
  });

  console.log(`  ✓ Created ${3} API keys`);

  // Create sample webhooks
  console.log('Creating webhooks...');
  const webhook = await prisma.webhook.create({
    data: {
      userId: adminUser.id,
      name: 'Transaction Webhook',
      url: 'https://webhook.site/test',
      secret: crypto.randomBytes(32).toString('hex'),
      events: ['transaction.confirmed', 'transaction.failed'],
      status: 'ACTIVE',
    },
  });

  console.log(`  ✓ Created ${1} webhook`);

  // Create sample workflow
  console.log('Creating workflows...');
  const workflow = await prisma.workflow.create({
    data: {
      userId: adminUser.id,
      name: 'Price Alert Workflow',
      description: 'Triggers when SOL price crosses threshold',
      trigger: {
        type: 'price_threshold',
        asset: 'SOL',
        condition: 'above',
        value: 100,
      },
      steps: [
        { action: 'notify', channel: 'webhook', webhookId: webhook.id },
        { action: 'log', message: 'Price alert triggered' },
      ],
      status: 'ACTIVE',
    },
  });

  console.log(`  ✓ Created ${1} workflow`);

  // Create sample ZK circuits
  console.log('Creating ZK circuits...');
  await prisma.zkCircuit.createMany({
    data: [
      {
        name: 'balance_proof',
        description: 'Prove balance is above threshold without revealing exact amount',
        version: '1.0.0',
        publicInputs: ['threshold', 'commitment'],
      },
      {
        name: 'ownership_proof',
        description: 'Prove ownership of an address without revealing private key',
        version: '1.0.0',
        publicInputs: ['address', 'message_hash'],
      },
      {
        name: 'transaction_proof',
        description: 'Prove a transaction occurred without revealing details',
        version: '1.0.0',
        publicInputs: ['tx_hash', 'block_number'],
      },
    ],
  });

  console.log(`  ✓ Created ${3} ZK circuits`);

  // Create sample price cache entries
  console.log('Creating price cache...');
  await prisma.priceCache.createMany({
    data: [
      { symbol: 'SOL', source: 'coingecko', price: 95.50, volume24h: 1500000000, change24h: 2.5 },
      { symbol: 'BTC', source: 'coingecko', price: 43500.00, volume24h: 25000000000, change24h: -0.8 },
      { symbol: 'ETH', source: 'coingecko', price: 2250.00, volume24h: 12000000000, change24h: 1.2 },
    ],
  });

  console.log(`  ✓ Created ${3} price cache entries`);

  // Output summary
  console.log('\n' + '='.repeat(50));
  console.log('✅ Database seeded successfully!\n');
  console.log('Test API Keys (save these):');
  console.log('='.repeat(50));
  console.log(`Admin (Enterprise): ${testApiKey}`);
  console.log(`Pro:                ${proApiKey}`);
  console.log(`Free:               ${freeApiKey}`);
  console.log('='.repeat(50));
  console.log('\nTest users password: password123');
  console.log('\nYou can now start the server with: npm run dev');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

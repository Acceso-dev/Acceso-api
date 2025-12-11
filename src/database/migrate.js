/**
 * Database Migration Script
 * Creates all required tables for api.acceso.dev
 * 
 * Run with: npm run migrate
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'acceso_api',
  user: process.env.DB_USER || 'user',
  password: process.env.DB_PASSWORD || 'password',
});

const migrations = [
  // Enable required extensions
  {
    name: 'extensions',
    sql: `
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    `
  },

  // Users table
  {
    name: 'users',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        email_verified BOOLEAN DEFAULT false,
        email_verified_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
    `
  },

  // API Keys table
  {
    name: 'api_keys',
    sql: `
      CREATE TABLE IF NOT EXISTS api_keys (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        key_hash VARCHAR(255) NOT NULL,
        key_prefix VARCHAR(20) NOT NULL,
        tier VARCHAR(20) DEFAULT 'free',
        is_active BOOLEAN DEFAULT true,
        expires_at TIMESTAMP,
        last_used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
      CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
      CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);
    `
  },

  // Usage Metrics table
  {
    name: 'usage_metrics',
    sql: `
      CREATE TABLE IF NOT EXISTS usage_metrics (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
        endpoint VARCHAR(255) NOT NULL,
        method VARCHAR(10) NOT NULL,
        status_code INTEGER,
        response_time_ms INTEGER,
        request_id VARCHAR(50),
        ip_address INET,
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_metrics(user_id);
      CREATE INDEX IF NOT EXISTS idx_usage_api_key ON usage_metrics(api_key_id);
      CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_metrics(created_at);
      CREATE INDEX IF NOT EXISTS idx_usage_endpoint ON usage_metrics(endpoint);
    `
  },

  // Webhooks table
  {
    name: 'webhooks',
    sql: `
      CREATE TABLE IF NOT EXISTS webhooks (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        url VARCHAR(500) NOT NULL,
        events JSONB NOT NULL DEFAULT '[]',
        secret VARCHAR(100) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        last_triggered_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_webhooks_user ON webhooks(user_id);
      CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(is_active);
      CREATE INDEX IF NOT EXISTS idx_webhooks_events ON webhooks USING gin(events);
    `
  },

  // Webhook Deliveries table
  {
    name: 'webhook_deliveries',
    sql: `
      CREATE TABLE IF NOT EXISTS webhook_deliveries (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
        event VARCHAR(100) NOT NULL,
        payload JSONB,
        status VARCHAR(20) DEFAULT 'pending',
        response_code INTEGER,
        response_body TEXT,
        error TEXT,
        duration_ms INTEGER,
        attempt INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
      CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
      CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created ON webhook_deliveries(created_at);
    `
  },

  // Workflows table
  {
    name: 'workflows',
    sql: `
      CREATE TABLE IF NOT EXISTS workflows (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        trigger JSONB NOT NULL,
        conditions JSONB DEFAULT '[]',
        actions JSONB NOT NULL,
        is_active BOOLEAN DEFAULT false,
        execution_count INTEGER DEFAULT 0,
        last_executed_at TIMESTAMP,
        last_execution_status VARCHAR(20),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_workflows_user ON workflows(user_id);
      CREATE INDEX IF NOT EXISTS idx_workflows_active ON workflows(is_active);
      CREATE INDEX IF NOT EXISTS idx_workflows_trigger ON workflows USING gin(trigger);
    `
  },

  // Workflow Executions table
  {
    name: 'workflow_executions',
    sql: `
      CREATE TABLE IF NOT EXISTS workflow_executions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        triggered_by VARCHAR(50) NOT NULL,
        trigger_data JSONB DEFAULT '{}',
        status VARCHAR(20) DEFAULT 'pending',
        result JSONB,
        error TEXT,
        logs JSONB DEFAULT '[]',
        duration_ms INTEGER,
        started_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow ON workflow_executions(workflow_id);
      CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(status);
      CREATE INDEX IF NOT EXISTS idx_workflow_executions_started ON workflow_executions(started_at);
    `
  },

  // Transactions table (Solana)
  {
    name: 'transactions',
    sql: `
      CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        signature VARCHAR(100) UNIQUE NOT NULL,
        type VARCHAR(50) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        from_address VARCHAR(50),
        to_address VARCHAR(50),
        amount DECIMAL(20, 9),
        fee DECIMAL(20, 9),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_signature ON transactions(signature);
      CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
      CREATE INDEX IF NOT EXISTS idx_transactions_from ON transactions(from_address);
      CREATE INDEX IF NOT EXISTS idx_transactions_to ON transactions(to_address);
    `
  },

  // Price Cache table (Polymarket)
  {
    name: 'price_cache',
    sql: `
      CREATE TABLE IF NOT EXISTS price_cache (
        id BIGSERIAL PRIMARY KEY,
        market_id VARCHAR(100) NOT NULL,
        price DECIMAL(10, 6) NOT NULL,
        volume DECIMAL(20, 2),
        timestamp TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(market_id, timestamp)
      );
      
      CREATE INDEX IF NOT EXISTS idx_price_cache_market ON price_cache(market_id);
      CREATE INDEX IF NOT EXISTS idx_price_cache_timestamp ON price_cache(timestamp);
      CREATE INDEX IF NOT EXISTS idx_price_cache_market_time ON price_cache(market_id, timestamp);
    `
  },

  // ZK Proofs table
  {
    name: 'zk_proofs',
    sql: `
      CREATE TABLE IF NOT EXISTS zk_proofs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        circuit_id VARCHAR(50) NOT NULL,
        inputs JSONB NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        proof JSONB,
        public_signals JSONB,
        error TEXT,
        duration_ms INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_zk_proofs_user ON zk_proofs(user_id);
      CREATE INDEX IF NOT EXISTS idx_zk_proofs_status ON zk_proofs(status);
      CREATE INDEX IF NOT EXISTS idx_zk_proofs_circuit ON zk_proofs(circuit_id);
    `
  },

  // Rate Limits table (for persistent rate limiting)
  {
    name: 'rate_limits',
    sql: `
      CREATE TABLE IF NOT EXISTS rate_limits (
        id BIGSERIAL PRIMARY KEY,
        key VARCHAR(255) NOT NULL,
        count INTEGER DEFAULT 0,
        window_start TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(key, window_start)
      );
      
      CREATE INDEX IF NOT EXISTS idx_rate_limits_key ON rate_limits(key);
      CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);
    `
  },

  // Migrations table (to track applied migrations)
  {
    name: 'migrations',
    sql: `
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT NOW()
      );
    `
  },
];

async function migrate() {
  console.log('🚀 Starting database migration...\n');

  try {
    // Check connection
    const client = await pool.connect();
    console.log('✅ Connected to database\n');

    for (const migration of migrations) {
      try {
        // Check if migration was already applied
        const check = await client.query(
          'SELECT 1 FROM migrations WHERE name = $1',
          [migration.name]
        ).catch(() => ({ rows: [] }));

        if (check.rows.length > 0) {
          console.log(`⏭️  Skipping: ${migration.name} (already applied)`);
          continue;
        }

        // Apply migration
        await client.query(migration.sql);

        // Record migration
        await client.query(
          'INSERT INTO migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
          [migration.name]
        );

        console.log(`✅ Applied: ${migration.name}`);
      } catch (error) {
        console.error(`❌ Failed: ${migration.name}`);
        console.error(`   Error: ${error.message}`);
        throw error;
      }
    }

    client.release();
    console.log('\n✅ Migration completed successfully!\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

async function rollback(migrationName) {
  console.log(`⏪ Rolling back: ${migrationName || 'last migration'}...\n`);
  
  try {
    const client = await pool.connect();

    // Get last migration if no name provided
    let targetMigration = migrationName;
    if (!targetMigration) {
      const result = await client.query(
        'SELECT name FROM migrations ORDER BY applied_at DESC LIMIT 1'
      );
      targetMigration = result.rows[0]?.name;
    }

    if (!targetMigration) {
      console.log('No migrations to rollback.');
      return;
    }

    // Drop the table (simple rollback strategy)
    await client.query(`DROP TABLE IF EXISTS ${targetMigration} CASCADE`);
    await client.query('DELETE FROM migrations WHERE name = $1', [targetMigration]);

    console.log(`✅ Rolled back: ${targetMigration}`);

    client.release();
  } catch (error) {
    console.error('❌ Rollback failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

async function status() {
  console.log('📊 Migration Status\n');

  try {
    const client = await pool.connect();

    const result = await client.query(
      'SELECT name, applied_at FROM migrations ORDER BY applied_at'
    );

    if (result.rows.length === 0) {
      console.log('No migrations applied yet.');
    } else {
      console.log('Applied migrations:');
      for (const row of result.rows) {
        console.log(`  ✅ ${row.name} (${row.applied_at.toISOString()})`);
      }
    }

    const pending = migrations.filter(
      (m) => !result.rows.find((r) => r.name === m.name)
    );

    if (pending.length > 0) {
      console.log('\nPending migrations:');
      for (const m of pending) {
        console.log(`  ⏳ ${m.name}`);
      }
    }

    client.release();
  } catch (error) {
    console.error('❌ Error checking status:', error.message);
  } finally {
    await pool.end();
  }
}

// CLI
if (require.main === module) {
  const command = process.argv[2] || 'up';

  switch (command) {
    case 'up':
    case 'migrate':
      migrate();
      break;
    case 'down':
    case 'rollback':
      rollback(process.argv[3]);
      break;
    case 'status':
      status();
      break;
    default:
      console.log('Usage: node migrate.js [up|down|status]');
      process.exit(1);
  }
}

module.exports = { migrate, rollback, status };

/**
 * Application Configuration
 */

module.exports = {
  // Environment
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  apiVersion: process.env.API_VERSION || 'v1',

  // Security
  jwtSecret: process.env.JWT_SECRET || 'development-secret-change-in-production',
  jwtExpiry: process.env.JWT_EXPIRY || '24h',
  apiKeySalt: process.env.API_KEY_SALT || 'development-salt',
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
    premiumMaxRequests: parseInt(process.env.RATE_LIMIT_PREMIUM_MAX, 10) || 1000,
  },

  // WebSocket
  wsPort: parseInt(process.env.WS_PORT, 10) || 3001,
  wsHeartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL, 10) || 30000,

  // Webhook
  webhook: {
    secret: process.env.WEBHOOK_SECRET || 'webhook-secret',
    maxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES, 10) || 3,
    timeoutMs: parseInt(process.env.WEBHOOK_TIMEOUT_MS, 10) || 10000,
  },

  // ZK Proof
  zkProof: {
    timeoutMs: parseInt(process.env.ZK_PROOF_TIMEOUT, 10) || 300000,
    maxQueueSize: parseInt(process.env.ZK_MAX_QUEUE_SIZE, 10) || 100,
  },

  // Workflow
  workflow: {
    maxExecutionTime: parseInt(process.env.WORKFLOW_MAX_EXECUTION_TIME, 10) || 300000,
    maxRetries: parseInt(process.env.WORKFLOW_MAX_RETRIES, 10) || 3,
  },

  // Monitoring
  metrics: {
    enabled: process.env.ENABLE_METRICS === 'true',
    port: parseInt(process.env.METRICS_PORT, 10) || 9090,
  },

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // CORS
  cors: {
    allowedOrigins: [
      'https://acceso.dev',
      'https://dashboard.acceso.dev',
      'http://localhost:3000',
      'http://localhost:5173',
    ],
  },
};

/**
 * api.acceso.dev - Main Entry Point
 * Clean, Lightweight API Infrastructure
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

// Config
const config = require('./config/app');
const { connect: connectPrisma, disconnect: disconnectPrisma } = require('./lib/prisma');
const { connectRedis, disconnectRedis } = require('./config/redis');

// Middleware
const { authMiddleware } = require('./middleware/auth');
const { rateLimitMiddleware } = require('./middleware/rateLimit');
const { errorHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/logging');
const { corsMiddleware } = require('./middleware/cors');
const { validationMiddleware } = require('./middleware/validation');

// Routes
const healthRoutes = require('./routes/v1/health');
const authRoutes = require('./routes/v1/auth');
const solanaRoutes = require('./routes/v1/solana');
const polymarketRoutes = require('./routes/v1/polymarket');
const workflowRoutes = require('./routes/v1/workflows');
const zkRoutes = require('./routes/v1/zk');
const webhookRoutes = require('./routes/v1/webhooks');

// Utils
const logger = require('./utils/logger');

const app = express();

// ======================
// Core Middleware
// ======================

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
}));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS
app.use(corsMiddleware);

// Request logging (Morgan + custom)
if (config.env !== 'test') {
  app.use(morgan('combined', { stream: logger.stream }));
}
app.use(requestLogger);

// Trust proxy (for Cloudflare)
app.set('trust proxy', 1);

// ======================
// Health Routes (No Auth)
// ======================

app.use('/', healthRoutes);

// ======================
// Auth Routes (No Auth Required for register/login)
// ======================

app.use('/v1/auth', authRoutes);

// ======================
// API Routes (With Auth)
// ======================

// Apply auth and rate limiting to all /v1 routes
app.use('/v1', authMiddleware);
app.use('/v1', rateLimitMiddleware);

// V1 API Routes
app.use('/v1/solana', solanaRoutes);
app.use('/v1/polymarket', polymarketRoutes);
app.use('/v1/workflows', workflowRoutes);
app.use('/v1/zk', zkRoutes);
app.use('/v1/webhooks', webhookRoutes);

// ======================
// V2 Routes (Future)
// ======================

app.use('/v2', (req, res) => {
  res.status(501).json({
    success: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'API v2 is coming soon',
      request_id: req.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

// ======================
// 404 Handler
// ======================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint ${req.method} ${req.path} not found`,
      request_id: req.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

// ======================
// Error Handler
// ======================

app.use(errorHandler);

// ======================
// Server Startup
// ======================

async function startServer() {
  try {
    // Connect to PostgreSQL via Prisma
    await connectPrisma();
    logger.info('✅ PostgreSQL connected via Prisma');

    // Connect to Redis
    await connectRedis();
    logger.info('✅ Redis connected');

    // Start Express server
    const server = app.listen(config.port, () => {
      logger.info(`🚀 API Server running on port ${config.port}`);
      logger.info(`📡 Environment: ${config.env}`);
      logger.info(`🔗 Base URL: ${config.baseUrl}`);
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal) => {
      logger.info(`\n${signal} received. Shutting down gracefully...`);
      
      server.close(async () => {
        logger.info('HTTP server closed');
        
        // Close Prisma connection
        await disconnectPrisma();
        logger.info('PostgreSQL connection closed');
        
        // Close Redis connection
        await disconnectRedis();
        logger.info('Redis connection closed');
        
        process.exit(0);
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    return server;
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start if not in test mode
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };

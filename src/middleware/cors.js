/**
 * CORS Middleware Configuration
 */

const cors = require('cors');
const config = require('../config/app');
const logger = require('../utils/logger');

/**
 * CORS options
 */
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // Check if origin is allowed
    if (config.cors.allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Allow all localhost origins in development
    if (config.env === 'development' && origin.includes('localhost')) {
      return callback(null, true);
    }

    // Log rejected origin
    logger.warn('CORS rejected origin:', { origin });
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-API-Key',
    'X-Request-ID',
    'X-Requested-With',
  ],
  exposedHeaders: [
    'X-Request-ID',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'Retry-After',
  ],
  maxAge: 86400, // 24 hours
};

/**
 * CORS middleware
 */
const corsMiddleware = cors(corsOptions);

/**
 * Preflight handler for OPTIONS requests
 */
function preflightHandler(req, res) {
  res.sendStatus(204);
}

module.exports = {
  corsMiddleware,
  corsOptions,
  preflightHandler,
};

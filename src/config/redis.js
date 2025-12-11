/**
 * Redis Configuration
 */

const Redis = require('ioredis');
const logger = require('../utils/logger');

// Create Redis client with Redis Cloud configuration
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  username: process.env.REDIS_USERNAME || 'default',
  password: process.env.REDIS_PASSWORD || undefined,
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

// Redis event handlers
redis.on('connect', () => {
  logger.info('Redis connecting...');
});

redis.on('ready', () => {
  logger.info('Redis ready');
});

redis.on('error', (err) => {
  logger.error('Redis error:', err.message);
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

// Connection test
async function connectRedis() {
  try {
    const pong = await redis.ping();
    if (pong === 'PONG') {
      logger.info('Redis connected successfully');
      return true;
    }
    throw new Error('Redis ping failed');
  } catch (error) {
    logger.error('Redis connection failed:', error.message);
    throw error;
  }
}

// Cache helpers
const cache = {
  /**
   * Get cached value
   */
  async get(key) {
    try {
      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Cache get error:', error.message);
      return null;
    }
  },

  /**
   * Set cached value with TTL
   */
  async set(key, value, ttlSeconds = 60) {
    try {
      await redis.setex(key, ttlSeconds, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error('Cache set error:', error.message);
      return false;
    }
  },

  /**
   * Delete cached value
   */
  async del(key) {
    try {
      await redis.del(key);
      return true;
    } catch (error) {
      logger.error('Cache del error:', error.message);
      return false;
    }
  },

  /**
   * Check if key exists
   */
  async exists(key) {
    try {
      return await redis.exists(key);
    } catch (error) {
      logger.error('Cache exists error:', error.message);
      return false;
    }
  },

  /**
   * Increment counter
   */
  async incr(key, ttlSeconds = 60) {
    try {
      const result = await redis.multi()
        .incr(key)
        .expire(key, ttlSeconds)
        .exec();
      return result[0][1];
    } catch (error) {
      logger.error('Cache incr error:', error.message);
      return null;
    }
  },
};

// Pub/Sub for WebSocket
const subscriber = redis.duplicate();
const publisher = redis.duplicate();

// Disconnect Redis
async function disconnectRedis() {
  try {
    await subscriber.quit();
    await publisher.quit();
    await redis.quit();
    logger.info('Redis disconnected');
  } catch (error) {
    logger.error('Redis disconnect error:', error.message);
  }
}

module.exports = {
  redis,
  cache,
  subscriber,
  publisher,
  connectRedis,
  disconnectRedis,
};

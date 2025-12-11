/**
 * Cache Utility Helpers
 */

const { cache, redis } = require('../config/redis');
const logger = require('./logger');

/**
 * Cache decorator - wraps an async function with caching
 */
function withCache(keyPrefix, ttlSeconds = 60) {
  return function (target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args) {
      const cacheKey = `${keyPrefix}:${JSON.stringify(args)}`;
      
      // Try to get from cache
      const cached = await cache.get(cacheKey);
      if (cached !== null) {
        logger.debug(`Cache hit: ${cacheKey}`);
        return cached;
      }

      // Execute original function
      const result = await originalMethod.apply(this, args);
      
      // Store in cache
      await cache.set(cacheKey, result, ttlSeconds);
      logger.debug(`Cache miss, stored: ${cacheKey}`);
      
      return result;
    };

    return descriptor;
  };
}

/**
 * Get or set cache with callback
 */
async function getOrSet(key, ttlSeconds, callback) {
  // Try cache first
  const cached = await cache.get(key);
  if (cached !== null) {
    return { data: cached, cached: true };
  }

  // Execute callback
  const data = await callback();
  
  // Store in cache
  await cache.set(key, data, ttlSeconds);
  
  return { data, cached: false };
}

/**
 * Invalidate cache by pattern
 */
async function invalidatePattern(pattern) {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
      logger.info(`Invalidated ${keys.length} cache keys matching: ${pattern}`);
    }
    return keys.length;
  } catch (error) {
    logger.error('Cache invalidation error:', error.message);
    return 0;
  }
}

/**
 * Rate limit check using sorted set
 */
async function checkRateLimit(key, maxRequests, windowSeconds) {
  const now = Date.now();
  const windowStart = now - (windowSeconds * 1000);

  try {
    // Remove old entries
    await redis.zremrangebyscore(key, 0, windowStart);
    
    // Count current requests
    const count = await redis.zcard(key);
    
    if (count >= maxRequests) {
      return { allowed: false, remaining: 0, reset: windowSeconds };
    }

    // Add new request
    await redis.zadd(key, now, `${now}-${Math.random()}`);
    await redis.expire(key, windowSeconds);

    return {
      allowed: true,
      remaining: maxRequests - count - 1,
      reset: windowSeconds,
    };
  } catch (error) {
    logger.error('Rate limit check error:', error.message);
    // Allow request on error
    return { allowed: true, remaining: maxRequests, reset: windowSeconds };
  }
}

/**
 * Queue operations using Redis list
 */
const queue = {
  async push(queueName, data) {
    return redis.lpush(queueName, JSON.stringify(data));
  },

  async pop(queueName) {
    const item = await redis.rpop(queueName);
    return item ? JSON.parse(item) : null;
  },

  async length(queueName) {
    return redis.llen(queueName);
  },

  async peek(queueName, count = 10) {
    const items = await redis.lrange(queueName, -count, -1);
    return items.map((item) => JSON.parse(item));
  },
};

module.exports = {
  withCache,
  getOrSet,
  invalidatePattern,
  checkRateLimit,
  queue,
  cache,
};

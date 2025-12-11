/**
 * Rate Limiting Middleware
 * Per-key rate limiting using Redis
 */

const { checkRateLimit } = require('../utils/cache');
const { errorResponse } = require('../utils/response');
const logger = require('../utils/logger');
const { ERROR_CODES, HTTP_STATUS, RATE_LIMIT_TIERS } = require('../config/constants');

/**
 * Get rate limit config for user tier
 */
function getTierLimits(tier) {
  const limits = RATE_LIMIT_TIERS[tier?.toUpperCase()] || RATE_LIMIT_TIERS.FREE;
  return {
    maxRequests: limits.requests,
    windowSeconds: limits.windowMs / 1000,
  };
}

/**
 * Main rate limit middleware
 */
async function rateLimitMiddleware(req, res, next) {
  // Skip rate limiting for health checks
  if (req.path === '/health' || req.path === '/ready') {
    return next();
  }

  const userId = req.user?.id;
  const apiKeyId = req.user?.apiKeyId;
  const tier = req.user?.tier || 'free';

  // Create rate limit key
  const key = apiKeyId 
    ? `ratelimit:key:${apiKeyId}` 
    : `ratelimit:ip:${req.ip}`;

  const { maxRequests, windowSeconds } = getTierLimits(tier);

  try {
    const result = await checkRateLimit(key, maxRequests, windowSeconds);

    // Set rate limit headers
    res.set({
      'X-RateLimit-Limit': maxRequests,
      'X-RateLimit-Remaining': Math.max(0, result.remaining),
      'X-RateLimit-Reset': Math.floor(Date.now() / 1000) + windowSeconds,
    });

    if (!result.allowed) {
      logger.warn('Rate limit exceeded', {
        userId,
        apiKeyId,
        tier,
        ip: req.ip,
        path: req.path,
      });

      res.set('Retry-After', windowSeconds);
      
      return errorResponse(
        res,
        ERROR_CODES.RATE_LIMIT_EXCEEDED,
        'Too many requests. Please try again later.',
        HTTP_STATUS.TOO_MANY_REQUESTS
      );
    }

    next();
  } catch (error) {
    logger.error('Rate limit middleware error:', error);
    // Allow request on error (fail open)
    next();
  }
}

/**
 * Create custom rate limiter for specific routes
 */
function createRateLimiter(maxRequests, windowSeconds) {
  return async (req, res, next) => {
    const key = `ratelimit:custom:${req.path}:${req.user?.apiKeyId || req.ip}`;

    try {
      const result = await checkRateLimit(key, maxRequests, windowSeconds);

      res.set({
        'X-RateLimit-Limit': maxRequests,
        'X-RateLimit-Remaining': Math.max(0, result.remaining),
        'X-RateLimit-Reset': Math.floor(Date.now() / 1000) + windowSeconds,
      });

      if (!result.allowed) {
        res.set('Retry-After', windowSeconds);
        return errorResponse(
          res,
          ERROR_CODES.RATE_LIMIT_EXCEEDED,
          'Rate limit exceeded for this endpoint',
          HTTP_STATUS.TOO_MANY_REQUESTS
        );
      }

      next();
    } catch (error) {
      logger.error('Custom rate limiter error:', error);
      next();
    }
  };
}

/**
 * Stricter rate limit for expensive operations (ZK proofs, etc.)
 */
const strictRateLimit = createRateLimiter(10, 60);

/**
 * Very strict rate limit for sensitive operations
 */
const sensitiveRateLimit = createRateLimiter(5, 300);

module.exports = {
  rateLimitMiddleware,
  createRateLimiter,
  strictRateLimit,
  sensitiveRateLimit,
};

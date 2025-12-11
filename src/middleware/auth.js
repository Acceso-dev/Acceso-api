/**
 * Authentication Middleware
 * Validates API keys for protected routes
 */

const crypto = require('crypto');
const { prisma } = require('../lib/prisma');
const { cache } = require('../config/redis');
const { errorResponse } = require('../utils/response');
const { maskApiKey } = require('../utils/crypto');
const logger = require('../utils/logger');
const { ERROR_CODES, HTTP_STATUS, CACHE_TTL } = require('../config/constants');

/**
 * Extract API key from request
 */
function extractApiKey(req) {
  // Check header first
  const headerKey = req.headers['x-api-key'];
  if (headerKey) return headerKey;

  // Check Authorization header (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check query parameter (not recommended, but supported)
  return req.query.api_key;
}

/**
 * Main auth middleware
 */
async function authMiddleware(req, res, next) {
  const apiKey = extractApiKey(req);

  if (!apiKey) {
    logger.warn('Request without API key', { path: req.path, ip: req.ip });
    return errorResponse(
      res,
      ERROR_CODES.UNAUTHORIZED,
      'API key is required. Provide it in X-API-Key header.',
      HTTP_STATUS.UNAUTHORIZED
    );
  }

  try {
    // Check cache first
    const cacheKey = `apikey:${apiKey.substring(0, 16)}`;
    let apiKeyData = await cache.get(cacheKey);

    if (!apiKeyData) {
      // Hash the API key to match stored hash
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

      // Query database using Prisma
      const apiKeyRecord = await prisma.apiKey.findUnique({
        where: { keyHash },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              status: true,
            },
          },
        },
      });

      if (!apiKeyRecord) {
        logger.warn('Invalid API key attempt', {
          key: maskApiKey(apiKey),
          ip: req.ip,
        });
        return errorResponse(
          res,
          ERROR_CODES.INVALID_API_KEY,
          'Invalid API key',
          HTTP_STATUS.UNAUTHORIZED
        );
      }

      apiKeyData = {
        id: apiKeyRecord.id,
        user_id: apiKeyRecord.userId,
        name: apiKeyRecord.name,
        tier: apiKeyRecord.tier,
        is_active: apiKeyRecord.status === 'ACTIVE',
        expires_at: apiKeyRecord.expiresAt,
        last_used_at: apiKeyRecord.lastUsedAt,
        email: apiKeyRecord.user.email,
        user_active: apiKeyRecord.user.status === 'ACTIVE',
      };
      
      // Cache the result
      await cache.set(cacheKey, apiKeyData, CACHE_TTL.API_KEY);
    }

    // Check if key is active
    if (!apiKeyData.is_active) {
      return errorResponse(
        res,
        ERROR_CODES.API_KEY_REVOKED,
        'API key has been revoked',
        HTTP_STATUS.UNAUTHORIZED
      );
    }

    // Check if user is active
    if (!apiKeyData.user_active) {
      return errorResponse(
        res,
        ERROR_CODES.UNAUTHORIZED,
        'User account is disabled',
        HTTP_STATUS.UNAUTHORIZED
      );
    }

    // Check expiration
    if (apiKeyData.expires_at && new Date(apiKeyData.expires_at) < new Date()) {
      return errorResponse(
        res,
        ERROR_CODES.API_KEY_EXPIRED,
        'API key has expired',
        HTTP_STATUS.UNAUTHORIZED
      );
    }

    // Attach user info to request
    req.user = {
      id: apiKeyData.user_id,
      email: apiKeyData.email,
      apiKeyId: apiKeyData.id,
      apiKeyName: apiKeyData.name,
      tier: apiKeyData.tier || 'free',
    };

    // Update last used (async, don't wait)
    prisma.apiKey.update({
      where: { id: apiKeyData.id },
      data: { lastUsedAt: new Date() },
    }).catch((err) => logger.error('Failed to update last_used_at:', err.message));

    next();
  } catch (error) {
    logger.error('Auth middleware error:', error);
    return errorResponse(
      res,
      ERROR_CODES.INTERNAL_ERROR,
      'Authentication failed',
      HTTP_STATUS.INTERNAL_ERROR
    );
  }
}

/**
 * Optional auth - doesn't fail if no key provided
 */
async function optionalAuth(req, res, next) {
  const apiKey = extractApiKey(req);
  
  if (!apiKey) {
    req.user = null;
    return next();
  }

  return authMiddleware(req, res, next);
}

/**
 * Require specific tier
 */
function requireTier(...allowedTiers) {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(
        res,
        ERROR_CODES.UNAUTHORIZED,
        'Authentication required',
        HTTP_STATUS.UNAUTHORIZED
      );
    }

    if (!allowedTiers.includes(req.user.tier)) {
      return errorResponse(
        res,
        ERROR_CODES.UNAUTHORIZED,
        `This endpoint requires ${allowedTiers.join(' or ')} tier`,
        HTTP_STATUS.FORBIDDEN
      );
    }

    next();
  };
}

module.exports = {
  authMiddleware,
  optionalAuth,
  requireTier,
};

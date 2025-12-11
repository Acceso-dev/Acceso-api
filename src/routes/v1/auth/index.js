/**
 * Authentication Routes
 * API key management for api.acceso.dev
 * 
 * Allows users to:
 * - Create API keys (acceso_xxx format)
 * - List their API keys
 * - Revoke/delete API keys
 * - Test API keys
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { asyncHandler } = require('../../../middleware/errorHandler');
const { validateBody, Joi } = require('../../../middleware/validation');
const { successResponse, errorResponse } = require('../../../utils/response');
const { generateApiKey, hashPassword, verifyPassword } = require('../../../utils/crypto');
const { prisma } = require('../../../lib/prisma');
const { authMiddleware, optionalAuth } = require('../../../middleware/auth');
const logger = require('../../../utils/logger');

// Validation schemas
const schemas = {
  createKey: Joi.object({
    name: Joi.string().min(1).max(100).required()
      .description('A friendly name for this API key'),
    tier: Joi.string().valid('free', 'pro', 'enterprise').default('free')
      .description('API tier level'),
    expiresIn: Joi.number().integer().min(1).max(365).optional()
      .description('Days until expiration (optional, default: never)'),
  }),
  register: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).max(128).required(),
    name: Joi.string().min(1).max(100).optional(),
  }),
  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  }),
};

/**
 * POST /v1/auth/register
 * Register a new user account
 */
router.post(
  '/register',
  validateBody(schemas.register),
  asyncHandler(async (req, res) => {
    const { email, name } = req.body;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return errorResponse(res, 'USER_EXISTS', 'An account with this email already exists', 409);
    }

    // Hash password
    const hashedPassword = await hashPassword(req.body.password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
        name: name || email.split('@')[0],
        status: 'ACTIVE',
      },
    });

    // Auto-generate first API key
    const apiKeyPlain = generateApiKey('free');
    const keyHash = crypto.createHash('sha256').update(apiKeyPlain).digest('hex');

    await prisma.apiKey.create({
      data: {
        userId: user.id,
        name: 'Default API Key',
        keyHash,
        keyPrefix: apiKeyPlain.substring(0, 16),
        tier: 'FREE',
        status: 'ACTIVE',
      },
    });

    logger.info('New user registered', { userId: user.id, email: user.email });

    return successResponse(res, {
      message: 'Account created successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      api_key: {
        key: apiKeyPlain,
        name: 'Default API Key',
        tier: 'free',
        note: 'Save this key securely. You will not be able to see it again!',
      },
    }, { status: 201 });
  })
);

/**
 * POST /v1/auth/login
 * Login and get session info
 */
router.post(
  '/login',
  validateBody(schemas.login),
  asyncHandler(async (req, res) => {
    const { email } = req.body;

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      return errorResponse(res, 'INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    const validPassword = await verifyPassword(req.body.password, user.password);
    if (!validPassword) {
      return errorResponse(res, 'INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    if (user.status !== 'ACTIVE') {
      return errorResponse(res, 'ACCOUNT_DISABLED', 'Your account has been disabled', 403);
    }

    // Get user's API keys
    const apiKeys = await prisma.apiKey.findMany({
      where: { userId: user.id, status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        tier: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });

    logger.info('User logged in', { userId: user.id });

    return successResponse(res, {
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      api_keys: apiKeys.map(k => ({
        id: k.id,
        name: k.name,
        key_prefix: k.keyPrefix,
        tier: k.tier.toLowerCase(),
        created_at: k.createdAt,
        last_used_at: k.lastUsedAt,
      })),
    });
  })
);

/**
 * POST /v1/auth/keys
 * Create a new API key (requires authentication)
 */
router.post(
  '/keys',
  authMiddleware,
  validateBody(schemas.createKey),
  asyncHandler(async (req, res) => {
    const { name, tier, expiresIn } = req.body;
    const userId = req.user.id;

    // Check key limit based on user tier
    const keyCount = await prisma.apiKey.count({
      where: { userId, status: 'ACTIVE' },
    });

    const keyLimits = { free: 3, pro: 10, enterprise: 50 };
    const userTier = req.user.tier || 'free';
    const maxKeys = keyLimits[userTier] || 3;

    if (keyCount >= maxKeys) {
      return errorResponse(
        res,
        'KEY_LIMIT_REACHED',
        `You can only have ${maxKeys} active API keys on the ${userTier} tier`,
        400
      );
    }

    // Generate new API key with acceso_ prefix
    const apiKeyPlain = generateApiKey(tier);
    const keyHash = crypto.createHash('sha256').update(apiKeyPlain).digest('hex');

    // Calculate expiration
    const expiresAt = expiresIn 
      ? new Date(Date.now() + expiresIn * 24 * 60 * 60 * 1000)
      : null;

    // Create the key
    const apiKey = await prisma.apiKey.create({
      data: {
        userId,
        name,
        keyHash,
        keyPrefix: apiKeyPlain.substring(0, 16),
        tier: tier.toUpperCase(),
        status: 'ACTIVE',
        expiresAt,
      },
    });

    logger.info('API key created', { userId, keyId: apiKey.id, tier });

    return successResponse(res, {
      message: 'API key created successfully',
      api_key: {
        id: apiKey.id,
        key: apiKeyPlain,
        name: apiKey.name,
        tier,
        expires_at: expiresAt?.toISOString() || null,
        created_at: apiKey.createdAt,
        note: 'Save this key securely. You will not be able to see it again!',
      },
    }, { status: 201 });
  })
);

/**
 * GET /v1/auth/keys
 * List all API keys for the authenticated user
 */
router.get(
  '/keys',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const apiKeys = await prisma.apiKey.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        tier: true,
        status: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return successResponse(res, {
      keys: apiKeys.map(k => ({
        id: k.id,
        name: k.name,
        key_preview: `${k.keyPrefix}...`,
        tier: k.tier.toLowerCase(),
        status: k.status.toLowerCase(),
        created_at: k.createdAt,
        last_used_at: k.lastUsedAt,
        expires_at: k.expiresAt,
      })),
      total: apiKeys.length,
    });
  })
);

/**
 * DELETE /v1/auth/keys/:id
 * Revoke/delete an API key
 */
router.delete(
  '/keys/:id',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    // Find the key and verify ownership
    const apiKey = await prisma.apiKey.findFirst({
      where: { id, userId },
    });

    if (!apiKey) {
      return errorResponse(res, 'KEY_NOT_FOUND', 'API key not found', 404);
    }

    // Don't allow deleting the key being used for this request
    if (apiKey.id === req.user.apiKeyId) {
      return errorResponse(
        res,
        'CANNOT_DELETE_CURRENT_KEY',
        'Cannot delete the API key currently being used for authentication',
        400
      );
    }

    // Soft delete - mark as revoked
    await prisma.apiKey.update({
      where: { id },
      data: { status: 'REVOKED' },
    });

    logger.info('API key revoked', { userId, keyId: id });

    return successResponse(res, {
      message: 'API key revoked successfully',
      key_id: id,
    });
  })
);

/**
 * POST /v1/auth/keys/test
 * Test an API key without full authentication
 */
router.post(
  '/keys/test',
  asyncHandler(async (req, res) => {
    const apiKey = req.headers['x-api-key'] || req.body.api_key;

    if (!apiKey) {
      return errorResponse(res, 'NO_KEY_PROVIDED', 'Provide API key in X-API-Key header or body', 400);
    }

    // Validate format
    if (!apiKey.startsWith('acceso_')) {
      return successResponse(res, {
        valid: false,
        error: 'Invalid key format. Keys must start with "acceso_"',
      });
    }

    // Hash and lookup
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    const apiKeyRecord = await prisma.apiKey.findUnique({
      where: { keyHash },
      include: {
        user: {
          select: {
            email: true,
            status: true,
          },
        },
      },
    });

    if (!apiKeyRecord) {
      return successResponse(res, {
        valid: false,
        error: 'API key not found',
      });
    }

    if (apiKeyRecord.status !== 'ACTIVE') {
      return successResponse(res, {
        valid: false,
        error: `API key is ${apiKeyRecord.status.toLowerCase()}`,
      });
    }

    if (apiKeyRecord.expiresAt && new Date(apiKeyRecord.expiresAt) < new Date()) {
      return successResponse(res, {
        valid: false,
        error: 'API key has expired',
      });
    }

    return successResponse(res, {
      valid: true,
      key: {
        name: apiKeyRecord.name,
        tier: apiKeyRecord.tier.toLowerCase(),
        created_at: apiKeyRecord.createdAt,
        last_used_at: apiKeyRecord.lastUsedAt,
        expires_at: apiKeyRecord.expiresAt,
      },
      user: {
        email: apiKeyRecord.user.email,
      },
    });
  })
);

/**
 * GET /v1/auth/me
 * Get current authenticated user info
 */
router.get(
  '/me',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        createdAt: true,
        _count: {
          select: { apiKeys: true },
        },
      },
    });

    return successResponse(res, {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status.toLowerCase(),
      api_keys_count: user._count.apiKeys,
      current_key: {
        id: req.user.apiKeyId,
        name: req.user.apiKeyName,
        tier: req.user.tier,
      },
      created_at: user.createdAt,
    });
  })
);

module.exports = router;

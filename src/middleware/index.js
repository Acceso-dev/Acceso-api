/**
 * Middleware Index - Export all middleware
 */

const { authMiddleware, optionalAuth, requireTier } = require('./auth');
const { rateLimitMiddleware, createRateLimiter, strictRateLimit, sensitiveRateLimit } = require('./rateLimit');
const { validateBody, validateQuery, validateParams, commonSchemas, validationMiddleware, Joi } = require('./validation');
const { requestLogger, logAsync, logUsageMetrics } = require('./logging');
const { ApiError, errorHandler, asyncHandler, notFoundHandler } = require('./errorHandler');
const { corsMiddleware, corsOptions, preflightHandler } = require('./cors');

module.exports = {
  // Auth
  authMiddleware,
  optionalAuth,
  requireTier,

  // Rate Limiting
  rateLimitMiddleware,
  createRateLimiter,
  strictRateLimit,
  sensitiveRateLimit,

  // Validation
  validateBody,
  validateQuery,
  validateParams,
  commonSchemas,
  validationMiddleware,
  Joi,

  // Logging
  requestLogger,
  logAsync,
  logUsageMetrics,

  // Error Handling
  ApiError,
  errorHandler,
  asyncHandler,
  notFoundHandler,

  // CORS
  corsMiddleware,
  corsOptions,
  preflightHandler,
};

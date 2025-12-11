/**
 * Request Validation Middleware
 * Using Joi for schema validation
 */

const Joi = require('joi');
const { errorResponse } = require('../utils/response');
const { ERROR_CODES, HTTP_STATUS } = require('../config/constants');

/**
 * Validate request body against schema
 */
function validateBody(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((d) => ({
        field: d.path.join('.'),
        message: d.message,
      }));

      return errorResponse(
        res,
        ERROR_CODES.VALIDATION_ERROR,
        'Request validation failed',
        HTTP_STATUS.BAD_REQUEST,
        details
      );
    }

    req.body = value;
    next();
  };
}

/**
 * Validate request query parameters
 */
function validateQuery(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((d) => ({
        field: d.path.join('.'),
        message: d.message,
      }));

      return errorResponse(
        res,
        ERROR_CODES.VALIDATION_ERROR,
        'Query parameter validation failed',
        HTTP_STATUS.BAD_REQUEST,
        details
      );
    }

    req.query = value;
    next();
  };
}

/**
 * Validate request params
 */
function validateParams(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((d) => ({
        field: d.path.join('.'),
        message: d.message,
      }));

      return errorResponse(
        res,
        ERROR_CODES.VALIDATION_ERROR,
        'Path parameter validation failed',
        HTTP_STATUS.BAD_REQUEST,
        details
      );
    }

    req.params = value;
    next();
  };
}

// ======================
// Common Schemas
// ======================

const commonSchemas = {
  // Pagination
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
  }),

  // UUID
  uuid: Joi.string().uuid({ version: 'uuidv4' }),

  // Solana address
  solanaAddress: Joi.string()
    .pattern(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
    .message('Invalid Solana address'),

  // Solana signature
  solanaSignature: Joi.string()
    .pattern(/^[1-9A-HJ-NP-Za-km-z]{87,88}$/)
    .message('Invalid Solana signature'),

  // URL
  url: Joi.string().uri({ scheme: ['http', 'https'] }),

  // Email
  email: Joi.string().email(),

  // Webhook events
  webhookEvents: Joi.array().items(
    Joi.string().valid(
      'transaction.created',
      'transaction.confirmed',
      'account.updated',
      'workflow.completed',
      'workflow.failed',
      'proof.completed'
    )
  ),
};

// ======================
// Validation Middleware
// ======================

const validationMiddleware = {
  // Add request ID if not present
  addRequestId: (req, res, next) => {
    if (!req.requestId) {
      req.requestId = `req_${Date.now().toString(36)}${Math.random().toString(36).substr(2, 9)}`;
    }
    res.set('X-Request-ID', req.requestId);
    next();
  },

  // Validate content type for POST/PUT
  requireJson: (req, res, next) => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const contentType = req.headers['content-type'];
      if (!contentType || !contentType.includes('application/json')) {
        return errorResponse(
          res,
          ERROR_CODES.VALIDATION_ERROR,
          'Content-Type must be application/json',
          HTTP_STATUS.BAD_REQUEST
        );
      }
    }
    next();
  },
};

module.exports = {
  validateBody,
  validateQuery,
  validateParams,
  commonSchemas,
  validationMiddleware,
  Joi,
};

/**
 * Global Error Handler Middleware
 */

const logger = require('../utils/logger');
const { ERROR_CODES, HTTP_STATUS } = require('../config/constants');
const config = require('../config/app');

/**
 * Custom API Error class
 */
class ApiError extends Error {
  constructor(code, message, statusCode = 400, details = null) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error type checks
 */
function isOperationalError(error) {
  if (error instanceof ApiError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Global error handler
 */
function errorHandler(err, req, res, next) {
  // Log the error
  logger.error('Error occurred:', {
    requestId: req.requestId,
    path: req.path,
    method: req.method,
    error: err.message,
    stack: config.env === 'development' ? err.stack : undefined,
    code: err.code,
  });

  // Handle known API errors
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        request_id: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Handle validation errors (Joi)
  if (err.name === 'ValidationError' && err.isJoi) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Validation failed',
        details: err.details?.map((d) => ({
          field: d.path.join('.'),
          message: d.message,
        })),
        request_id: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Handle JSON parse errors
  if (err.type === 'entity.parse.failed') {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: {
        code: ERROR_CODES.INVALID_INPUT,
        message: 'Invalid JSON in request body',
        request_id: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Handle PostgreSQL errors
  if (err.code && err.code.startsWith('23')) {
    // Constraint violation
    return res.status(HTTP_STATUS.CONFLICT).json({
      success: false,
      error: {
        code: ERROR_CODES.ALREADY_EXISTS,
        message: 'Resource already exists or constraint violation',
        request_id: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Handle timeout errors
  if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
    return res.status(HTTP_STATUS.GATEWAY_TIMEOUT).json({
      success: false,
      error: {
        code: ERROR_CODES.SERVICE_UNAVAILABLE,
        message: 'Request timed out',
        request_id: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Default to internal server error
  const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_ERROR;
  const message = config.env === 'production'
    ? 'An unexpected error occurred'
    : err.message;

  return res.status(statusCode).json({
    success: false,
    error: {
      code: ERROR_CODES.INTERNAL_ERROR,
      message,
      request_id: req.requestId,
      timestamp: new Date().toISOString(),
      ...(config.env === 'development' && { stack: err.stack }),
    },
  });
}

/**
 * Async handler wrapper
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Not found handler
 */
function notFoundHandler(req, res) {
  res.status(HTTP_STATUS.NOT_FOUND).json({
    success: false,
    error: {
      code: ERROR_CODES.NOT_FOUND,
      message: `Endpoint ${req.method} ${req.path} not found`,
      request_id: req.requestId,
      timestamp: new Date().toISOString(),
    },
  });
}

module.exports = {
  ApiError,
  errorHandler,
  asyncHandler,
  notFoundHandler,
  isOperationalError,
};

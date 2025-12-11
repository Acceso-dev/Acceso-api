/**
 * Request Logging Middleware
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

/**
 * Generate request ID
 */
function generateRequestId() {
  return `req_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
}

/**
 * Main request logger middleware
 */
function requestLogger(req, res, next) {
  // Assign request ID
  req.requestId = req.headers['x-request-id'] || generateRequestId();
  res.set('X-Request-ID', req.requestId);

  // Capture start time
  const startTime = Date.now();

  // Log request
  const logData = {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    query: Object.keys(req.query).length ? req.query : undefined,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    userId: req.user?.id,
    apiKeyId: req.user?.apiKeyId,
  };

  logger.info(`→ ${req.method} ${req.path}`, logData);

  // Capture response
  const originalSend = res.send;
  res.send = function (body) {
    const duration = Date.now() - startTime;
    
    // Log response
    logger.info(`← ${req.method} ${req.path} ${res.statusCode} (${duration}ms)`, {
      requestId: req.requestId,
      statusCode: res.statusCode,
      duration,
      userId: req.user?.id,
    });

    // Log slow requests
    if (duration > 1000) {
      logger.warn(`Slow request: ${req.method} ${req.path} took ${duration}ms`, {
        requestId: req.requestId,
        duration,
      });
    }

    return originalSend.call(this, body);
  };

  next();
}

/**
 * Async logging (for background operations)
 */
function logAsync(level, message, data = {}) {
  setImmediate(() => {
    logger[level](message, data);
  });
}

/**
 * Log API usage metrics
 */
async function logUsageMetrics(req, res) {
  const { query } = require('../config/database');
  
  try {
    await query(
      `INSERT INTO usage_metrics (
        user_id,
        api_key_id,
        endpoint,
        method,
        status_code,
        response_time_ms,
        request_id,
        ip_address,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        req.user?.id,
        req.user?.apiKeyId,
        req.path,
        req.method,
        res.statusCode,
        res.responseTime,
        req.requestId,
        req.ip,
      ]
    );
  } catch (error) {
    logger.error('Failed to log usage metrics:', error.message);
  }
}

module.exports = {
  requestLogger,
  logAsync,
  logUsageMetrics,
};

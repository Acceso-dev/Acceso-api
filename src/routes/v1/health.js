/**
 * Health Check Routes
 * No authentication required
 */

const express = require('express');
const router = express.Router();
const { prisma, healthCheck: dbHealthCheck } = require('../../lib/prisma');
const { redis } = require('../../config/redis');
const { successResponse, errorResponse } = require('../../utils/response');
const logger = require('../../utils/logger');

// Prometheus metrics
let promClient;
try {
  promClient = require('prom-client');
  const register = new promClient.Registry();
  promClient.collectDefaultMetrics({ register });
} catch (e) {
  logger.warn('prom-client not available');
}

/**
 * GET /health
 * Basic health check - returns 200 if server is running
 */
router.get('/health', (req, res) => {
  return successResponse(res, {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

/**
 * GET /ready
 * Readiness probe - checks database and Redis connections
 */
router.get('/ready', async (req, res) => {
  const checks = {
    database: false,
    redis: false,
  };

  try {
    // Check PostgreSQL via Prisma
    const dbCheck = await dbHealthCheck();
    checks.database = dbCheck.status === 'healthy';
  } catch (error) {
    logger.error('Database health check failed:', error.message);
  }

  try {
    // Check Redis
    const redisResult = await redis.ping();
    checks.redis = redisResult === 'PONG';
  } catch (error) {
    logger.error('Redis health check failed:', error.message);
  }

  const isReady = checks.database && checks.redis;
  const statusCode = isReady ? 200 : 503;

  return res.status(statusCode).json({
    success: isReady,
    data: {
      status: isReady ? 'ready' : 'not ready',
      checks,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * GET /metrics
 * Prometheus metrics endpoint
 */
router.get('/metrics', async (req, res) => {
  if (!promClient) {
    return errorResponse(res, 'METRICS_UNAVAILABLE', 'Metrics not configured', 503);
  }

  try {
    const register = promClient.register;
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    logger.error('Metrics error:', error.message);
    return errorResponse(res, 'METRICS_ERROR', 'Failed to get metrics', 500);
  }
});

/**
 * GET /
 * API information
 */
router.get('/', (req, res) => {
  return successResponse(res, {
    name: 'api.acceso.dev',
    version: 'v1',
    description: 'Clean, Lightweight API Infrastructure',
    documentation: 'https://docs.acceso.dev',
    endpoints: {
      health: '/health',
      ready: '/ready',
      metrics: '/metrics',
      solana: '/v1/solana',
      polymarket: '/v1/polymarket',
      workflows: '/v1/workflows',
      zk: '/v1/zk',
      webhooks: '/v1/webhooks',
    },
  });
});

module.exports = router;

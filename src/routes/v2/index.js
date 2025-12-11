/**
 * API v2 Routes (Placeholder)
 * Future features will be added here
 */

const express = require('express');
const router = express.Router();
const { successResponse } = require('../../utils/response');

/**
 * GET /v2
 * V2 API information
 */
router.get('/', (req, res) => {
  return successResponse(res, {
    version: 'v2',
    status: 'coming_soon',
    planned_features: [
      'Advanced workflow orchestration',
      'Multi-chain support',
      'Enhanced ZK proof circuits',
      'Real-time analytics API',
      'Batch operations',
      'GraphQL endpoint',
    ],
    eta: 'Q2 2025',
    message: 'V2 API is under development. Stay tuned!',
  });
});

/**
 * Catch-all for v2 routes
 */
router.all('*', (req, res) => {
  return res.status(501).json({
    success: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'API v2 is coming soon. This endpoint is not yet available.',
      timestamp: new Date().toISOString(),
    },
  });
});

module.exports = router;

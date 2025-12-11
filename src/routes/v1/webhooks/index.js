/**
 * Webhook Routes
 * Webhook management
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../../../middleware/errorHandler');
const { validateBody, validateQuery, validateParams, Joi } = require('../../../middleware/validation');
const { successResponse, errorResponse, paginatedResponse, createdResponse } = require('../../../utils/response');
const WebhookService = require('../../../services/webhook');
const { prisma } = require('../../../lib/prisma');
const logger = require('../../../utils/logger');

// Validation schemas
const schemas = {
  webhookId: Joi.object({
    id: Joi.string().uuid().required(),
  }),
  createWebhook: Joi.object({
    name: Joi.string().min(1).max(100).required(),
    url: Joi.string().uri({ scheme: ['https'] }).required(), // HTTPS only
    events: Joi.array().items(
      Joi.string().valid(
        'transaction.created',
        'transaction.confirmed',
        'account.updated',
        'workflow.completed',
        'workflow.failed',
        'proof.completed',
        'price.threshold'
      )
    ).min(1).required(),
  }),
  updateWebhook: Joi.object({
    name: Joi.string().min(1).max(100),
    url: Joi.string().uri({ scheme: ['https'] }),
    events: Joi.array().items(
      Joi.string().valid(
        'transaction.created',
        'transaction.confirmed',
        'account.updated',
        'workflow.completed',
        'workflow.failed',
        'proof.completed',
        'price.threshold'
      )
    ).min(1),
    is_active: Joi.boolean(),
  }),
  listWebhooks: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
  }),
  testWebhook: Joi.object({
    payload: Joi.object().default({ test: true }),
  }),
};

// Helper to generate webhook secret
const crypto = require('crypto');
function generateSecret() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * POST /v1/webhooks
 * Create a new webhook
 */
router.post(
  '/',
  validateBody(schemas.createWebhook),
  asyncHandler(async (req, res) => {
    const secret = generateSecret();
    
    const webhook = await prisma.webhook.create({
      data: {
        userId: req.user.id,
        name: req.body.name,
        url: req.body.url,
        events: req.body.events,
        secret,
        status: 'ACTIVE',
      },
    });

    return createdResponse(res, {
      id: webhook.id,
      name: webhook.name,
      url: webhook.url,
      events: webhook.events,
      secret: webhook.secret, // Only returned once at creation
      status: webhook.status,
      created_at: webhook.createdAt,
    });
  })
);

/**
 * GET /v1/webhooks
 * List webhooks for the authenticated user
 */
router.get(
  '/',
  validateQuery(schemas.listWebhooks),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.query;
    const skip = (page - 1) * limit;

    const [webhooks, total] = await Promise.all([
      prisma.webhook.findMany({
        where: { userId: req.user.id },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          url: true,
          events: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.webhook.count({ where: { userId: req.user.id } }),
    ]);

    return paginatedResponse(res, webhooks, {
      page,
      limit,
      total,
    });
  })
);

/**
 * GET /v1/webhooks/:id
 * Get webhook details
 */
router.get(
  '/:id',
  validateParams(schemas.webhookId),
  asyncHandler(async (req, res) => {
    const webhook = await prisma.webhook.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      select: {
        id: true,
        name: true,
        url: true,
        events: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!webhook) {
      return errorResponse(res, 'WEBHOOK_NOT_FOUND', 'Webhook not found', 404);
    }

    // Don't return the secret
    const { secret, ...webhookData } = webhook;
    return successResponse(res, webhookData);
  })
);

/**
 * PUT /v1/webhooks/:id
 * Update a webhook
 */
router.put(
  '/:id',
  validateParams(schemas.webhookId),
  validateBody(schemas.updateWebhook),
  asyncHandler(async (req, res) => {
    const webhook = await Webhook.update(req.params.id, req.user.id, req.body);

    if (!webhook) {
      return errorResponse(res, 'WEBHOOK_NOT_FOUND', 'Webhook not found', 404);
    }

    return successResponse(res, webhook);
  })
);

/**
 * DELETE /v1/webhooks/:id
 * Delete a webhook
 */
router.delete(
  '/:id',
  validateParams(schemas.webhookId),
  asyncHandler(async (req, res) => {
    const deleted = await Webhook.delete(req.params.id, req.user.id);

    if (!deleted) {
      return errorResponse(res, 'WEBHOOK_NOT_FOUND', 'Webhook not found', 404);
    }

    return res.status(204).send();
  })
);

/**
 * POST /v1/webhooks/:id/test
 * Test a webhook by sending a test payload
 */
router.post(
  '/:id/test',
  validateParams(schemas.webhookId),
  validateBody(schemas.testWebhook),
  asyncHandler(async (req, res) => {
    const webhook = await Webhook.findById(req.params.id, req.user.id);

    if (!webhook) {
      return errorResponse(res, 'WEBHOOK_NOT_FOUND', 'Webhook not found', 404);
    }

    const result = await WebhookService.test(webhook, req.body.payload);

    return successResponse(res, {
      webhook_id: webhook.id,
      success: result.success,
      status_code: result.statusCode,
      response_time_ms: result.duration,
      error: result.error,
    });
  })
);

/**
 * GET /v1/webhooks/:id/deliveries
 * Get webhook delivery logs
 */
router.get(
  '/:id/deliveries',
  validateParams(schemas.webhookId),
  validateQuery(Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
  })),
  asyncHandler(async (req, res) => {
    const webhook = await Webhook.findById(req.params.id, req.user.id);

    if (!webhook) {
      return errorResponse(res, 'WEBHOOK_NOT_FOUND', 'Webhook not found', 404);
    }

    const { page, limit } = req.query;
    const result = await WebhookDelivery.listByWebhook(req.params.id, { page, limit });

    return paginatedResponse(res, result.data, {
      page,
      limit,
      total: result.total,
    });
  })
);

/**
 * POST /v1/webhooks/:id/rotate-secret
 * Rotate webhook secret
 */
router.post(
  '/:id/rotate-secret',
  validateParams(schemas.webhookId),
  asyncHandler(async (req, res) => {
    const webhook = await Webhook.regenerateSecret(req.params.id, req.user.id);

    if (!webhook) {
      return errorResponse(res, 'WEBHOOK_NOT_FOUND', 'Webhook not found', 404);
    }

    return successResponse(res, {
      id: webhook.id,
      secret: webhook.secret, // New secret
      message: 'Secret rotated. Update your webhook handler with the new secret.',
    });
  })
);

/**
 * GET /v1/webhooks/:id/stats
 * Get webhook delivery stats
 */
router.get(
  '/:id/stats',
  validateParams(schemas.webhookId),
  asyncHandler(async (req, res) => {
    const webhook = await Webhook.findById(req.params.id, req.user.id);

    if (!webhook) {
      return errorResponse(res, 'WEBHOOK_NOT_FOUND', 'Webhook not found', 404);
    }

    const stats = await WebhookDelivery.getStats(req.params.id);
    return successResponse(res, stats);
  })
);

module.exports = router;

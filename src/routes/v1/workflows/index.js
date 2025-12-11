/**
 * Workflow Routes
 * Workflow engine x402
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../../../middleware/errorHandler');
const { validateBody, validateQuery, validateParams, Joi } = require('../../../middleware/validation');
const { successResponse, errorResponse, paginatedResponse, createdResponse } = require('../../../utils/response');
const WorkflowService = require('../../../services/workflow');
const { prisma } = require('../../../lib/prisma');
const logger = require('../../../utils/logger');

// Validation schemas
const schemas = {
  workflowId: Joi.object({
    id: Joi.string().uuid().required(),
  }),
  createWorkflow: Joi.object({
    name: Joi.string().min(1).max(100).required(),
    description: Joi.string().max(500),
    trigger: Joi.object({
      type: Joi.string().valid('manual', 'schedule', 'webhook', 'price_threshold', 'account_change', 'transaction').required(),
      config: Joi.object().default({}),
    }).required(),
    conditions: Joi.array().items(Joi.object({
      type: Joi.string().required(),
      operator: Joi.string().required(),
      value: Joi.any().required(),
    })).default([]),
    actions: Joi.array().items(Joi.object({
      type: Joi.string().valid('webhook', 'email', 'solana_transfer', 'solana_instruction', 'http_request').required(),
      config: Joi.object().required(),
    })).min(1).required(),
  }),
  updateWorkflow: Joi.object({
    name: Joi.string().min(1).max(100),
    description: Joi.string().max(500),
    trigger: Joi.object({
      type: Joi.string().valid('manual', 'schedule', 'webhook', 'price_threshold', 'account_change', 'transaction'),
      config: Joi.object(),
    }),
    conditions: Joi.array().items(Joi.object({
      type: Joi.string().required(),
      operator: Joi.string().required(),
      value: Joi.any().required(),
    })),
    actions: Joi.array().items(Joi.object({
      type: Joi.string().valid('webhook', 'email', 'solana_transfer', 'solana_instruction', 'http_request').required(),
      config: Joi.object().required(),
    })).min(1),
  }),
  listWorkflows: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    is_active: Joi.boolean(),
  }),
  executeWorkflow: Joi.object({
    trigger_data: Joi.object().default({}),
  }),
};

/**
 * POST /v1/workflows
 * Create a new workflow
 */
router.post(
  '/',
  validateBody(schemas.createWorkflow),
  asyncHandler(async (req, res) => {
    const workflow = await prisma.workflow.create({
      data: {
        userId: req.user.id,
        name: req.body.name,
        description: req.body.description,
        trigger: req.body.trigger,
        steps: req.body.actions || [],
        status: 'DRAFT',
      },
    });

    return createdResponse(res, workflow);
  })
);

/**
 * GET /v1/workflows
 * List workflows for the authenticated user
 */
router.get(
  '/',
  validateQuery(schemas.listWorkflows),
  asyncHandler(async (req, res) => {
    const { page, limit, is_active } = req.query;
    const skip = (page - 1) * limit;

    const where = { userId: req.user.id };
    if (is_active !== undefined) {
      where.status = is_active ? 'ACTIVE' : 'DRAFT';
    }

    const [workflows, total] = await Promise.all([
      prisma.workflow.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.workflow.count({ where }),
    ]);

    return paginatedResponse(res, workflows, {
      page,
      limit,
      total,
    });
  })
);

/**
 * GET /v1/workflows/:id
 * Get workflow details
 */
router.get(
  '/:id',
  validateParams(schemas.workflowId),
  asyncHandler(async (req, res) => {
    const workflow = await prisma.workflow.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!workflow) {
      return errorResponse(res, 'WORKFLOW_NOT_FOUND', 'Workflow not found', 404);
    }

    return successResponse(res, workflow);
  })
);

/**
 * PUT /v1/workflows/:id
 * Update a workflow
 */
router.put(
  '/:id',
  validateParams(schemas.workflowId),
  validateBody(schemas.updateWorkflow),
  asyncHandler(async (req, res) => {
    const existing = await prisma.workflow.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!existing) {
      return errorResponse(res, 'WORKFLOW_NOT_FOUND', 'Workflow not found', 404);
    }

    const workflow = await prisma.workflow.update({
      where: { id: req.params.id },
      data: {
        name: req.body.name,
        description: req.body.description,
        trigger: req.body.trigger,
        steps: req.body.actions,
      },
    });

    return successResponse(res, workflow);
  })
);

/**
 * DELETE /v1/workflows/:id
 * Delete a workflow
 */
router.delete(
  '/:id',
  validateParams(schemas.workflowId),
  asyncHandler(async (req, res) => {
    const existing = await prisma.workflow.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!existing) {
      return errorResponse(res, 'WORKFLOW_NOT_FOUND', 'Workflow not found', 404);
    }

    await prisma.workflow.delete({ where: { id: req.params.id } });

    return res.status(204).send();
  })
);

/**
 * POST /v1/workflows/:id/execute
 * Execute a workflow manually
 */
router.post(
  '/:id/execute',
  validateParams(schemas.workflowId),
  validateBody(schemas.executeWorkflow),
  asyncHandler(async (req, res) => {
    const workflow = await prisma.workflow.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!workflow) {
      return errorResponse(res, 'WORKFLOW_NOT_FOUND', 'Workflow not found', 404);
    }

    const execution = await WorkflowService.execute(workflow, {
      triggeredBy: 'manual',
      triggerData: req.body.trigger_data,
      userId: req.user.id,
    });

    return successResponse(res, {
      execution_id: execution.id,
      status: execution.status,
      started_at: execution.startedAt,
    }, {}, 202);
  })
);

/**
 * POST /v1/workflows/:id/enable
 * Enable a workflow
 */
router.post(
  '/:id/enable',
  validateParams(schemas.workflowId),
  asyncHandler(async (req, res) => {
    const existing = await prisma.workflow.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!existing) {
      return errorResponse(res, 'WORKFLOW_NOT_FOUND', 'Workflow not found', 404);
    }

    const workflow = await prisma.workflow.update({
      where: { id: req.params.id },
      data: { status: 'ACTIVE' },
    });

    return successResponse(res, workflow);
  })
);

/**
 * POST /v1/workflows/:id/disable
 * Disable a workflow
 */
router.post(
  '/:id/disable',
  validateParams(schemas.workflowId),
  asyncHandler(async (req, res) => {
    const existing = await prisma.workflow.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!existing) {
      return errorResponse(res, 'WORKFLOW_NOT_FOUND', 'Workflow not found', 404);
    }

    const workflow = await prisma.workflow.update({
      where: { id: req.params.id },
      data: { status: 'PAUSED' },
    });

    return successResponse(res, workflow);
  })
);

/**
 * GET /v1/workflows/:id/history
 * Get workflow execution history
 */
router.get(
  '/:id/history',
  validateParams(schemas.workflowId),
  validateQuery(Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
  })),
  asyncHandler(async (req, res) => {
    const workflow = await prisma.workflow.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!workflow) {
      return errorResponse(res, 'WORKFLOW_NOT_FOUND', 'Workflow not found', 404);
    }

    const { page, limit } = req.query;
    const skip = (page - 1) * limit;

    const [executions, total] = await Promise.all([
      prisma.workflowExecution.findMany({
        where: { workflowId: req.params.id },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.workflowExecution.count({ where: { workflowId: req.params.id } }),
    ]);

    return paginatedResponse(res, executions, {
      page,
      limit,
      total,
    });
  })
);

module.exports = router;

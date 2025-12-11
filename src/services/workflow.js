/**
 * Workflow Service
 * Handles workflow execution
 */

const Bull = require('bull');
const axios = require('axios');
const { redis } = require('../config/redis');
const logger = require('../utils/logger');
const config = require('../config/app');
const { Workflow, WorkflowExecution } = require('../models');
const { WORKFLOW_ACTIONS, WORKFLOW_TRIGGERS } = require('../config/constants');

// Workflow queue
const workflowQueue = new Bull('workflow-execution', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 100,
    attempts: config.workflow.maxRetries,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    timeout: config.workflow.maxExecutionTime,
  },
});

// Process workflow jobs
workflowQueue.process(async (job) => {
  const { executionId, workflow, triggerData } = job.data;
  
  try {
    await executeWorkflow(executionId, workflow, triggerData);
  } catch (error) {
    logger.error('Workflow execution failed:', {
      executionId,
      workflowId: workflow.id,
      error: error.message,
    });
    throw error;
  }
});

/**
 * Execute a workflow
 */
async function execute(workflow, { triggeredBy, triggerData, userId }) {
  // Create execution record
  const execution = await WorkflowExecution.create({
    workflowId: workflow.id,
    triggeredBy,
    triggerData,
  });

  // Queue the execution
  await workflowQueue.add({
    executionId: execution.id,
    workflow,
    triggerData,
  });

  return execution;
}

/**
 * Internal workflow execution
 */
async function executeWorkflow(executionId, workflow, triggerData) {
  const logs = [];
  const startTime = Date.now();

  try {
    logs.push({ time: new Date().toISOString(), message: 'Workflow started' });

    // Check conditions
    if (workflow.conditions && workflow.conditions.length > 0) {
      const conditionsMet = await evaluateConditions(workflow.conditions, triggerData);
      
      if (!conditionsMet) {
        logs.push({ time: new Date().toISOString(), message: 'Conditions not met, skipping' });
        await WorkflowExecution.updateStatus(executionId, {
          status: 'skipped',
          result: { reason: 'Conditions not met' },
          logs,
        });
        return;
      }
      
      logs.push({ time: new Date().toISOString(), message: 'Conditions evaluated: passed' });
    }

    // Execute actions
    const actions = typeof workflow.actions === 'string' 
      ? JSON.parse(workflow.actions) 
      : workflow.actions;

    const results = [];
    
    for (const action of actions) {
      logs.push({ time: new Date().toISOString(), message: `Executing action: ${action.type}` });
      
      try {
        const result = await executeAction(action, triggerData);
        results.push({ action: action.type, success: true, result });
        logs.push({ time: new Date().toISOString(), message: `Action ${action.type} completed` });
      } catch (actionError) {
        results.push({ action: action.type, success: false, error: actionError.message });
        logs.push({ time: new Date().toISOString(), message: `Action ${action.type} failed: ${actionError.message}` });
        throw actionError;
      }
    }

    // Update execution as successful
    await WorkflowExecution.updateStatus(executionId, {
      status: 'success',
      result: { actions: results },
      logs,
    });

    // Update workflow stats
    await Workflow.updateExecutionStats(workflow.id, true);

    logs.push({ time: new Date().toISOString(), message: 'Workflow completed successfully' });

  } catch (error) {
    logs.push({ time: new Date().toISOString(), message: `Workflow failed: ${error.message}` });
    
    await WorkflowExecution.updateStatus(executionId, {
      status: 'failed',
      error: error.message,
      logs,
    });

    await Workflow.updateExecutionStats(workflow.id, false);

    throw error;
  }
}

/**
 * Evaluate conditions
 */
async function evaluateConditions(conditions, data) {
  for (const condition of conditions) {
    const value = getNestedValue(data, condition.field || condition.type);
    const targetValue = condition.value;

    switch (condition.operator) {
      case 'equals':
      case 'eq':
        if (value !== targetValue) return false;
        break;
      case 'not_equals':
      case 'ne':
        if (value === targetValue) return false;
        break;
      case 'greater_than':
      case 'gt':
        if (value <= targetValue) return false;
        break;
      case 'less_than':
      case 'lt':
        if (value >= targetValue) return false;
        break;
      case 'contains':
        if (!String(value).includes(targetValue)) return false;
        break;
      case 'exists':
        if (value === undefined || value === null) return false;
        break;
      default:
        logger.warn(`Unknown condition operator: ${condition.operator}`);
    }
  }
  
  return true;
}

/**
 * Execute a single action
 */
async function executeAction(action, data) {
  switch (action.type) {
    case WORKFLOW_ACTIONS.WEBHOOK:
      return executeWebhookAction(action.config, data);
    
    case WORKFLOW_ACTIONS.HTTP_REQUEST:
      return executeHttpAction(action.config, data);
    
    case WORKFLOW_ACTIONS.EMAIL:
      return executeEmailAction(action.config, data);
    
    case WORKFLOW_ACTIONS.SOLANA_TRANSFER:
      return executeSolanaTransferAction(action.config, data);
    
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

/**
 * Execute webhook action
 */
async function executeWebhookAction(config, data) {
  const response = await axios.post(config.url, {
    event: 'workflow.action',
    data,
    timestamp: new Date().toISOString(),
  }, {
    timeout: 10000,
    headers: config.headers || {},
  });

  return { status: response.status, data: response.data };
}

/**
 * Execute HTTP request action
 */
async function executeHttpAction(config, data) {
  const response = await axios({
    method: config.method || 'POST',
    url: config.url,
    data: config.body || data,
    headers: config.headers || {},
    timeout: config.timeout || 10000,
  });

  return { status: response.status, data: response.data };
}

/**
 * Execute email action
 */
async function executeEmailAction(config, data) {
  // Placeholder - integrate with email service
  logger.info('Email action:', { to: config.to, subject: config.subject });
  return { sent: true, to: config.to };
}

/**
 * Execute Solana transfer action
 */
async function executeSolanaTransferAction(config, data) {
  // Placeholder - integrate with Solana service
  logger.info('Solana transfer action:', config);
  return { queued: true };
}

/**
 * Helper to get nested value from object
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Get queue stats
 */
async function getQueueStats() {
  const [waiting, active, completed, failed] = await Promise.all([
    workflowQueue.getWaitingCount(),
    workflowQueue.getActiveCount(),
    workflowQueue.getCompletedCount(),
    workflowQueue.getFailedCount(),
  ]);

  return { waiting, active, completed, failed };
}

module.exports = {
  execute,
  getQueueStats,
  workflowQueue,
};

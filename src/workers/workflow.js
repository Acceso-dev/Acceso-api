/**
 * Workflow Worker
 * Processes workflow execution jobs from the queue
 */

require('dotenv').config();
const logger = require('../utils/logger');
const { workflowQueue } = require('../services/workflow');

logger.info('🔄 Workflow worker starting...');

// Process is already set up in the service module
// This file just keeps the worker running

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing workflow queue...');
  await workflowQueue.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing workflow queue...');
  await workflowQueue.close();
  process.exit(0);
});

// Log queue events
workflowQueue.on('completed', (job, result) => {
  logger.info(`Job ${job.id} completed`);
});

workflowQueue.on('failed', (job, error) => {
  logger.error(`Job ${job.id} failed:`, error.message);
});

workflowQueue.on('stalled', (job) => {
  logger.warn(`Job ${job.id} stalled`);
});

logger.info('✅ Workflow worker ready');

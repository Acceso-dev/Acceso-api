/**
 * Webhook Worker
 * Processes webhook delivery jobs from the queue
 */

require('dotenv').config();
const logger = require('../utils/logger');
const { webhookQueue } = require('../services/webhook');

logger.info('🪝 Webhook worker starting...');

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing webhook queue...');
  await webhookQueue.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing webhook queue...');
  await webhookQueue.close();
  process.exit(0);
});

// Log queue events
webhookQueue.on('completed', (job, result) => {
  logger.info(`Webhook job ${job.id} completed`);
});

webhookQueue.on('failed', (job, error) => {
  logger.error(`Webhook job ${job.id} failed:`, error.message);
});

webhookQueue.on('stalled', (job) => {
  logger.warn(`Webhook job ${job.id} stalled`);
});

logger.info('✅ Webhook worker ready');

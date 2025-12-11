/**
 * ZK Proof Worker
 * Processes ZK proof generation jobs from the queue
 */

require('dotenv').config();
const logger = require('../utils/logger');
const { proofQueue } = require('../services/zk');

logger.info('🔐 ZK Proof worker starting...');

// Process is already set up in the service module
// This file just keeps the worker running

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing proof queue...');
  await proofQueue.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing proof queue...');
  await proofQueue.close();
  process.exit(0);
});

// Log queue events
proofQueue.on('completed', (job, result) => {
  logger.info(`Proof job ${job.id} completed`);
});

proofQueue.on('failed', (job, error) => {
  logger.error(`Proof job ${job.id} failed:`, error.message);
});

proofQueue.on('stalled', (job) => {
  logger.warn(`Proof job ${job.id} stalled`);
});

logger.info('✅ ZK Proof worker ready');

/**
 * Webhook Service
 * Handles webhook delivery and management
 */

const axios = require('axios');
const Bull = require('bull');
const { createHmacSignature } = require('../utils/crypto');
const logger = require('../utils/logger');
const config = require('../config/app');
const { Webhook, WebhookDelivery } = require('../models');
const { WEBHOOK_RETRY_DELAYS } = require('../config/constants');

// Webhook delivery queue
const webhookQueue = new Bull('webhook-delivery', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 100,
    attempts: config.webhook.maxRetries,
    backoff: {
      type: 'fixed',
      delay: WEBHOOK_RETRY_DELAYS[0],
    },
  },
});

// Process webhook jobs
webhookQueue.process(async (job) => {
  const { deliveryId, webhook, event, payload } = job.data;
  
  try {
    await deliverWebhook(deliveryId, webhook, event, payload, job.attemptsMade + 1);
  } catch (error) {
    logger.error('Webhook delivery failed:', {
      deliveryId,
      webhookId: webhook.id,
      attempt: job.attemptsMade + 1,
      error: error.message,
    });
    throw error;
  }
});

/**
 * Trigger webhooks for an event
 */
async function trigger(event, payload, userId = null) {
  // Find all active webhooks for this event
  const webhooks = await Webhook.findByEvent(event, userId);

  if (webhooks.length === 0) {
    return { triggered: 0 };
  }

  const deliveries = [];

  for (const webhook of webhooks) {
    // Create delivery record
    const delivery = await WebhookDelivery.create({
      webhookId: webhook.id,
      event,
      payload,
      status: 'pending',
    });

    // Queue delivery
    await webhookQueue.add({
      deliveryId: delivery.id,
      webhook: {
        id: webhook.id,
        url: webhook.url,
        secret: webhook.secret,
      },
      event,
      payload,
    });

    deliveries.push(delivery.id);
  }

  logger.info(`Triggered ${deliveries.length} webhooks for event: ${event}`);

  return { triggered: deliveries.length, deliveries };
}

/**
 * Deliver webhook
 */
async function deliverWebhook(deliveryId, webhook, event, payload, attempt) {
  const startTime = Date.now();

  // Prepare payload
  const webhookPayload = {
    event,
    data: payload,
    timestamp: new Date().toISOString(),
    delivery_id: deliveryId,
  };

  // Create HMAC signature
  const signature = createHmacSignature(webhookPayload, webhook.secret);

  try {
    const response = await axios.post(webhook.url, webhookPayload, {
      timeout: config.webhook.timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': event,
        'X-Webhook-Delivery': deliveryId,
        'X-Webhook-Timestamp': webhookPayload.timestamp,
        'User-Agent': 'AccesoAPI-Webhook/1.0',
      },
      validateStatus: (status) => status < 500, // Don't throw on 4xx
    });

    const duration = Date.now() - startTime;

    // Check if successful (2xx)
    const isSuccess = response.status >= 200 && response.status < 300;

    // Update delivery record
    await WebhookDelivery.updateStatus(deliveryId, {
      status: isSuccess ? 'success' : 'failed',
      responseCode: response.status,
      responseBody: JSON.stringify(response.data).substring(0, 1000),
      duration,
    });

    // Update webhook last triggered
    if (isSuccess) {
      await Webhook.updateLastTriggered(webhook.id);
    }

    logger.info('Webhook delivered:', {
      deliveryId,
      webhookId: webhook.id,
      status: response.status,
      duration,
    });

    if (!isSuccess) {
      throw new Error(`Webhook returned ${response.status}`);
    }

    return { success: true, statusCode: response.status, duration };

  } catch (error) {
    const duration = Date.now() - startTime;

    // Update delivery record
    await WebhookDelivery.updateStatus(deliveryId, {
      status: 'failed',
      error: error.message,
      duration,
    });

    throw error;
  }
}

/**
 * Test a webhook
 */
async function test(webhook, payload = {}) {
  const testPayload = {
    event: 'webhook.test',
    data: payload,
    timestamp: new Date().toISOString(),
    test: true,
  };

  const signature = createHmacSignature(testPayload, webhook.secret);
  const startTime = Date.now();

  try {
    const response = await axios.post(webhook.url, testPayload, {
      timeout: config.webhook.timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': 'webhook.test',
        'X-Webhook-Test': 'true',
        'User-Agent': 'AccesoAPI-Webhook/1.0',
      },
      validateStatus: () => true, // Accept any status
    });

    const duration = Date.now() - startTime;

    return {
      success: response.status >= 200 && response.status < 300,
      statusCode: response.status,
      duration,
      error: null,
    };

  } catch (error) {
    const duration = Date.now() - startTime;

    return {
      success: false,
      statusCode: null,
      duration,
      error: error.message,
    };
  }
}

/**
 * Send notification (for internal use)
 */
async function sendNotification(url, payload) {
  try {
    await axios.post(url, payload, {
      timeout: 5000,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('Notification failed:', { url, error: error.message });
  }
}

/**
 * Retry failed webhooks
 */
async function retryFailed() {
  const pendingRetries = await WebhookDelivery.getPendingRetries(config.webhook.maxRetries);

  for (const delivery of pendingRetries) {
    const attempt = await WebhookDelivery.incrementAttempt(delivery.id);
    
    // Calculate delay based on attempt
    const delayIndex = Math.min(attempt - 1, WEBHOOK_RETRY_DELAYS.length - 1);
    const delay = WEBHOOK_RETRY_DELAYS[delayIndex];

    await webhookQueue.add(
      {
        deliveryId: delivery.id,
        webhook: {
          id: delivery.webhook_id,
          url: delivery.url,
          secret: delivery.secret,
        },
        event: delivery.event,
        payload: delivery.payload,
      },
      { delay }
    );

    logger.info(`Scheduled webhook retry #${attempt} for delivery ${delivery.id}`);
  }

  return { retried: pendingRetries.length };
}

/**
 * Get queue stats
 */
async function getQueueStats() {
  const [waiting, active, completed, failed] = await Promise.all([
    webhookQueue.getWaitingCount(),
    webhookQueue.getActiveCount(),
    webhookQueue.getCompletedCount(),
    webhookQueue.getFailedCount(),
  ]);

  return { waiting, active, completed, failed };
}

module.exports = {
  trigger,
  test,
  sendNotification,
  retryFailed,
  getQueueStats,
  webhookQueue,
};

/**
 * Webhook Delivery Model
 */

const { query } = require('../config/database');
const logger = require('../utils/logger');

class WebhookDelivery {
  /**
   * Create delivery record
   */
  static async create({
    webhookId,
    event,
    payload,
    status = 'pending',
    attempt = 1,
  }) {
    const result = await query(
      `INSERT INTO webhook_deliveries (
        webhook_id, event, payload, status, attempt, created_at
       )
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id, webhook_id, event, status, attempt, created_at`,
      [webhookId, event, JSON.stringify(payload), status, attempt]
    );
    return result.rows[0];
  }

  /**
   * Update delivery status
   */
  static async updateStatus(id, { status, responseCode, responseBody, error, duration }) {
    const result = await query(
      `UPDATE webhook_deliveries 
       SET status = $2,
           response_code = $3,
           response_body = $4,
           error = $5,
           duration_ms = $6,
           completed_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, status, responseCode, responseBody, error, duration]
    );
    return result.rows[0];
  }

  /**
   * Increment attempt count
   */
  static async incrementAttempt(id) {
    const result = await query(
      `UPDATE webhook_deliveries 
       SET attempt = attempt + 1
       WHERE id = $1
       RETURNING attempt`,
      [id]
    );
    return result.rows[0]?.attempt || 0;
  }

  /**
   * Get deliveries for a webhook
   */
  static async listByWebhook(webhookId, { page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    
    const [deliveries, count] = await Promise.all([
      query(
        `SELECT id, event, status, response_code, attempt, duration_ms,
                created_at, completed_at
         FROM webhook_deliveries
         WHERE webhook_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [webhookId, limit, offset]
      ),
      query(
        'SELECT COUNT(*) as total FROM webhook_deliveries WHERE webhook_id = $1',
        [webhookId]
      ),
    ]);

    return {
      data: deliveries.rows,
      total: parseInt(count.rows[0].total, 10),
      page,
      limit,
    };
  }

  /**
   * Get pending retries
   */
  static async getPendingRetries(maxAttempts = 3) {
    const result = await query(
      `SELECT wd.*, w.url, w.secret
       FROM webhook_deliveries wd
       JOIN webhooks w ON wd.webhook_id = w.id
       WHERE wd.status = 'failed'
         AND wd.attempt < $1
         AND w.is_active = true
       ORDER BY wd.created_at ASC
       LIMIT 100`,
      [maxAttempts]
    );
    return result.rows;
  }

  /**
   * Get delivery stats
   */
  static async getStats(webhookId) {
    const result = await query(
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as successful,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        AVG(duration_ms)::integer as avg_duration
       FROM webhook_deliveries
       WHERE webhook_id = $1
         AND created_at >= NOW() - INTERVAL '7 days'`,
      [webhookId]
    );
    return result.rows[0];
  }

  /**
   * Cleanup old deliveries
   */
  static async cleanup(retentionDays = 30) {
    const result = await query(
      `DELETE FROM webhook_deliveries 
       WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
      [retentionDays]
    );
    return result.rowCount;
  }
}

module.exports = WebhookDelivery;

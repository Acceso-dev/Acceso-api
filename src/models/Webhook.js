/**
 * Webhook Model
 */

const { query } = require('../config/database');
const { generateToken } = require('../utils/crypto');
const logger = require('../utils/logger');

class Webhook {
  /**
   * Create a new webhook
   */
  static async create({ userId, name, url, events, secret = null }) {
    const webhookSecret = secret || generateToken(32);
    
    const result = await query(
      `INSERT INTO webhooks (
        user_id, name, url, events, secret, is_active, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
       RETURNING id, name, url, events, is_active, created_at`,
      [userId, name, url, JSON.stringify(events), webhookSecret]
    );

    return {
      ...result.rows[0],
      secret: webhookSecret, // Only returned once at creation
    };
  }

  /**
   * Find webhook by ID
   */
  static async findById(id, userId = null) {
    let queryText = `SELECT id, user_id, name, url, events, secret, is_active, 
                            last_triggered_at, created_at, updated_at
                     FROM webhooks WHERE id = $1`;
    const params = [id];
    
    if (userId) {
      queryText += ' AND user_id = $2';
      params.push(userId);
    }
    
    const result = await query(queryText, params);
    return result.rows[0] || null;
  }

  /**
   * List webhooks for a user
   */
  static async listByUser(userId, { page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    
    const [webhooks, count] = await Promise.all([
      query(
        `SELECT id, name, url, events, is_active, last_triggered_at, created_at
         FROM webhooks
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      ),
      query('SELECT COUNT(*) as total FROM webhooks WHERE user_id = $1', [userId]),
    ]);

    return {
      data: webhooks.rows,
      total: parseInt(count.rows[0].total, 10),
      page,
      limit,
    };
  }

  /**
   * Find webhooks by event type
   */
  static async findByEvent(event, userId = null) {
    let queryText = `SELECT id, user_id, name, url, events, secret, is_active
                     FROM webhooks
                     WHERE is_active = true
                       AND events @> $1`;
    const params = [JSON.stringify([event])];
    
    if (userId) {
      queryText += ' AND user_id = $2';
      params.push(userId);
    }
    
    const result = await query(queryText, params);
    return result.rows;
  }

  /**
   * Update webhook
   */
  static async update(id, userId, updates) {
    const { name, url, events, is_active } = updates;
    const result = await query(
      `UPDATE webhooks 
       SET name = COALESCE($3, name),
           url = COALESCE($4, url),
           events = COALESCE($5, events),
           is_active = COALESCE($6, is_active),
           updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id, name, url, events, is_active, updated_at`,
      [id, userId, name, url, events ? JSON.stringify(events) : null, is_active]
    );
    return result.rows[0] || null;
  }

  /**
   * Delete webhook
   */
  static async delete(id, userId) {
    const result = await query(
      'DELETE FROM webhooks WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return result.rowCount > 0;
  }

  /**
   * Update last triggered timestamp
   */
  static async updateLastTriggered(id) {
    await query(
      'UPDATE webhooks SET last_triggered_at = NOW() WHERE id = $1',
      [id]
    );
  }

  /**
   * Regenerate webhook secret
   */
  static async regenerateSecret(id, userId) {
    const newSecret = generateToken(32);
    const result = await query(
      `UPDATE webhooks 
       SET secret = $3, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id, name, url`,
      [id, userId, newSecret]
    );
    
    if (result.rows[0]) {
      return { ...result.rows[0], secret: newSecret };
    }
    return null;
  }
}

module.exports = Webhook;

/**
 * Workflow Model
 */

const { query } = require('../config/database');
const logger = require('../utils/logger');

class Workflow {
  /**
   * Create a new workflow
   */
  static async create({
    userId,
    name,
    description,
    trigger,
    conditions,
    actions,
  }) {
    const result = await query(
      `INSERT INTO workflows (
        user_id, name, description, trigger, conditions, actions,
        is_active, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, false, NOW(), NOW())
       RETURNING *`,
      [
        userId,
        name,
        description,
        JSON.stringify(trigger),
        JSON.stringify(conditions || []),
        JSON.stringify(actions),
      ]
    );
    return result.rows[0];
  }

  /**
   * Find workflow by ID
   */
  static async findById(id, userId = null) {
    let queryText = `SELECT * FROM workflows WHERE id = $1`;
    const params = [id];
    
    if (userId) {
      queryText += ' AND user_id = $2';
      params.push(userId);
    }
    
    const result = await query(queryText, params);
    return result.rows[0] || null;
  }

  /**
   * List workflows for a user
   */
  static async listByUser(userId, { page = 1, limit = 20, is_active } = {}) {
    const offset = (page - 1) * limit;
    let queryText = `SELECT id, name, description, trigger, is_active,
                            last_executed_at, execution_count, created_at
                     FROM workflows
                     WHERE user_id = $1`;
    const params = [userId];
    
    if (is_active !== undefined) {
      params.push(is_active);
      queryText += ` AND is_active = $${params.length}`;
    }
    
    queryText += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    const [workflows, count] = await Promise.all([
      query(queryText, params),
      query('SELECT COUNT(*) as total FROM workflows WHERE user_id = $1', [userId]),
    ]);

    return {
      data: workflows.rows,
      total: parseInt(count.rows[0].total, 10),
      page,
      limit,
    };
  }

  /**
   * Update workflow
   */
  static async update(id, userId, updates) {
    const { name, description, trigger, conditions, actions, is_active } = updates;
    
    const result = await query(
      `UPDATE workflows 
       SET name = COALESCE($3, name),
           description = COALESCE($4, description),
           trigger = COALESCE($5, trigger),
           conditions = COALESCE($6, conditions),
           actions = COALESCE($7, actions),
           is_active = COALESCE($8, is_active),
           updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [
        id,
        userId,
        name,
        description,
        trigger ? JSON.stringify(trigger) : null,
        conditions ? JSON.stringify(conditions) : null,
        actions ? JSON.stringify(actions) : null,
        is_active,
      ]
    );
    return result.rows[0] || null;
  }

  /**
   * Enable workflow
   */
  static async enable(id, userId) {
    const result = await query(
      `UPDATE workflows 
       SET is_active = true, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id, name, is_active`,
      [id, userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Disable workflow
   */
  static async disable(id, userId) {
    const result = await query(
      `UPDATE workflows 
       SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id, name, is_active`,
      [id, userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Delete workflow
   */
  static async delete(id, userId) {
    const result = await query(
      'DELETE FROM workflows WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return result.rowCount > 0;
  }

  /**
   * Find active workflows by trigger type
   */
  static async findByTrigger(triggerType) {
    const result = await query(
      `SELECT * FROM workflows
       WHERE is_active = true
         AND trigger->>'type' = $1`,
      [triggerType]
    );
    return result.rows;
  }

  /**
   * Update execution stats
   */
  static async updateExecutionStats(id, success) {
    await query(
      `UPDATE workflows 
       SET execution_count = execution_count + 1,
           last_executed_at = NOW(),
           last_execution_status = $2
       WHERE id = $1`,
      [id, success ? 'success' : 'failed']
    );
  }
}

module.exports = Workflow;

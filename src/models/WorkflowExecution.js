/**
 * Workflow Execution Model
 */

const { query } = require('../config/database');
const logger = require('../utils/logger');

class WorkflowExecution {
  /**
   * Create execution record
   */
  static async create({ workflowId, triggeredBy, triggerData }) {
    const result = await query(
      `INSERT INTO workflow_executions (
        workflow_id, triggered_by, trigger_data, status, started_at
       )
       VALUES ($1, $2, $3, 'running', NOW())
       RETURNING *`,
      [workflowId, triggeredBy, JSON.stringify(triggerData || {})]
    );
    return result.rows[0];
  }

  /**
   * Update execution status
   */
  static async updateStatus(id, { status, result, error, logs }) {
    const queryResult = await query(
      `UPDATE workflow_executions 
       SET status = $2,
           result = $3,
           error = $4,
           logs = $5,
           completed_at = NOW(),
           duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
       WHERE id = $1
       RETURNING *`,
      [id, status, JSON.stringify(result || {}), error, JSON.stringify(logs || [])]
    );
    return queryResult.rows[0];
  }

  /**
   * Add log entry
   */
  static async addLog(id, logEntry) {
    await query(
      `UPDATE workflow_executions 
       SET logs = logs || $2::jsonb
       WHERE id = $1`,
      [id, JSON.stringify([logEntry])]
    );
  }

  /**
   * Get execution by ID
   */
  static async findById(id) {
    const result = await query(
      'SELECT * FROM workflow_executions WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Get executions for a workflow
   */
  static async listByWorkflow(workflowId, { page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    
    const [executions, count] = await Promise.all([
      query(
        `SELECT id, status, triggered_by, duration_ms, started_at, completed_at
         FROM workflow_executions
         WHERE workflow_id = $1
         ORDER BY started_at DESC
         LIMIT $2 OFFSET $3`,
        [workflowId, limit, offset]
      ),
      query(
        'SELECT COUNT(*) as total FROM workflow_executions WHERE workflow_id = $1',
        [workflowId]
      ),
    ]);

    return {
      data: executions.rows,
      total: parseInt(count.rows[0].total, 10),
      page,
      limit,
    };
  }

  /**
   * Get running executions
   */
  static async getRunning() {
    const result = await query(
      `SELECT we.*, w.name as workflow_name
       FROM workflow_executions we
       JOIN workflows w ON we.workflow_id = w.id
       WHERE we.status = 'running'
       ORDER BY we.started_at ASC`
    );
    return result.rows;
  }

  /**
   * Get execution stats
   */
  static async getStats(workflowId) {
    const result = await query(
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as successful,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        AVG(duration_ms)::integer as avg_duration
       FROM workflow_executions
       WHERE workflow_id = $1
         AND started_at >= NOW() - INTERVAL '30 days'`,
      [workflowId]
    );
    return result.rows[0];
  }

  /**
   * Cleanup old executions
   */
  static async cleanup(retentionDays = 30) {
    const result = await query(
      `DELETE FROM workflow_executions 
       WHERE started_at < NOW() - INTERVAL '1 day' * $1`,
      [retentionDays]
    );
    return result.rowCount;
  }
}

module.exports = WorkflowExecution;

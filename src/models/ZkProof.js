/**
 * ZK Proof Model
 */

const { query } = require('../config/database');
const logger = require('../utils/logger');

class ZkProof {
  /**
   * Create proof request
   */
  static async create({ userId, circuitId, inputs, status = 'pending' }) {
    const result = await query(
      `INSERT INTO zk_proofs (
        user_id, circuit_id, inputs, status, created_at
       )
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING *`,
      [userId, circuitId, JSON.stringify(inputs), status]
    );
    return result.rows[0];
  }

  /**
   * Find by ID
   */
  static async findById(id, userId = null) {
    let queryText = `SELECT * FROM zk_proofs WHERE id = $1`;
    const params = [id];
    
    if (userId) {
      queryText += ' AND user_id = $2';
      params.push(userId);
    }
    
    const result = await query(queryText, params);
    return result.rows[0] || null;
  }

  /**
   * Update status
   */
  static async updateStatus(id, { status, proof, publicSignals, error, duration }) {
    const result = await query(
      `UPDATE zk_proofs 
       SET status = $2,
           proof = $3,
           public_signals = $4,
           error = $5,
           duration_ms = $6,
           completed_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        status,
        proof ? JSON.stringify(proof) : null,
        publicSignals ? JSON.stringify(publicSignals) : null,
        error,
        duration,
      ]
    );
    return result.rows[0];
  }

  /**
   * List proofs for user
   */
  static async listByUser(userId, { page = 1, limit = 20, status } = {}) {
    const offset = (page - 1) * limit;
    let queryText = `SELECT id, circuit_id, status, duration_ms, created_at, completed_at
                     FROM zk_proofs WHERE user_id = $1`;
    const params = [userId];
    
    if (status) {
      params.push(status);
      queryText += ` AND status = $${params.length}`;
    }
    
    queryText += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    const [proofs, count] = await Promise.all([
      query(queryText, params),
      query('SELECT COUNT(*) as total FROM zk_proofs WHERE user_id = $1', [userId]),
    ]);

    return {
      data: proofs.rows,
      total: parseInt(count.rows[0].total, 10),
      page,
      limit,
    };
  }

  /**
   * Get pending proofs for processing
   */
  static async getPending(limit = 10) {
    const result = await query(
      `SELECT * FROM zk_proofs
       WHERE status = 'pending'
       ORDER BY created_at ASC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  /**
   * Get proof stats
   */
  static async getStats(userId) {
    const result = await query(
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        AVG(duration_ms)::integer as avg_duration
       FROM zk_proofs
       WHERE user_id = $1
         AND created_at >= NOW() - INTERVAL '30 days'`,
      [userId]
    );
    return result.rows[0];
  }
}

module.exports = ZkProof;

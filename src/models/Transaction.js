/**
 * Transaction Model (for Solana transactions)
 */

const { query } = require('../config/database');
const logger = require('../utils/logger');

class Transaction {
  /**
   * Create transaction record
   */
  static async create({
    userId,
    signature,
    type,
    status = 'pending',
    fromAddress,
    toAddress,
    amount,
    fee,
    metadata,
  }) {
    const result = await query(
      `INSERT INTO transactions (
        user_id, signature, type, status, from_address, to_address,
        amount, fee, metadata, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       RETURNING *`,
      [
        userId,
        signature,
        type,
        status,
        fromAddress,
        toAddress,
        amount,
        fee,
        JSON.stringify(metadata || {}),
      ]
    );
    return result.rows[0];
  }

  /**
   * Find by signature
   */
  static async findBySignature(signature) {
    const result = await query(
      'SELECT * FROM transactions WHERE signature = $1',
      [signature]
    );
    return result.rows[0] || null;
  }

  /**
   * Update status
   */
  static async updateStatus(signature, status, metadata = {}) {
    const result = await query(
      `UPDATE transactions 
       SET status = $2,
           metadata = metadata || $3::jsonb,
           updated_at = NOW()
       WHERE signature = $1
       RETURNING *`,
      [signature, status, JSON.stringify(metadata)]
    );
    return result.rows[0] || null;
  }

  /**
   * List transactions for user
   */
  static async listByUser(userId, { page = 1, limit = 20, type, status } = {}) {
    const offset = (page - 1) * limit;
    let queryText = `SELECT * FROM transactions WHERE user_id = $1`;
    const params = [userId];
    
    if (type) {
      params.push(type);
      queryText += ` AND type = $${params.length}`;
    }
    
    if (status) {
      params.push(status);
      queryText += ` AND status = $${params.length}`;
    }
    
    queryText += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    const [transactions, count] = await Promise.all([
      query(queryText, params),
      query('SELECT COUNT(*) as total FROM transactions WHERE user_id = $1', [userId]),
    ]);

    return {
      data: transactions.rows,
      total: parseInt(count.rows[0].total, 10),
      page,
      limit,
    };
  }

  /**
   * List by address
   */
  static async listByAddress(address, { page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    
    const result = await query(
      `SELECT * FROM transactions 
       WHERE from_address = $1 OR to_address = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [address, limit, offset]
    );
    return result.rows;
  }

  /**
   * Get pending transactions
   */
  static async getPending(limit = 100) {
    const result = await query(
      `SELECT * FROM transactions
       WHERE status = 'pending'
         AND created_at > NOW() - INTERVAL '1 hour'
       ORDER BY created_at ASC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }
}

module.exports = Transaction;

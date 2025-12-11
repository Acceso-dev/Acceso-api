/**
 * User Model
 */

const { query, transaction } = require('../config/database');
const { hashPassword } = require('../utils/crypto');
const logger = require('../utils/logger');

class User {
  /**
   * Create a new user
   */
  static async create({ email, password, name }) {
    const passwordHash = await hashPassword(password);
    
    const result = await query(
      `INSERT INTO users (email, password_hash, name, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, true, NOW(), NOW())
       RETURNING id, email, name, is_active, created_at`,
      [email, passwordHash, name]
    );

    return result.rows[0];
  }

  /**
   * Find user by ID
   */
  static async findById(id) {
    const result = await query(
      `SELECT id, email, name, is_active, created_at, updated_at
       FROM users WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Find user by email
   */
  static async findByEmail(email) {
    const result = await query(
      `SELECT id, email, password_hash, name, is_active, created_at, updated_at
       FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );
    return result.rows[0] || null;
  }

  /**
   * Update user
   */
  static async update(id, updates) {
    const { name, is_active } = updates;
    const result = await query(
      `UPDATE users 
       SET name = COALESCE($2, name),
           is_active = COALESCE($3, is_active),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, name, is_active, updated_at`,
      [id, name, is_active]
    );
    return result.rows[0] || null;
  }

  /**
   * Delete user (soft delete)
   */
  static async delete(id) {
    const result = await query(
      `UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1`,
      [id]
    );
    return result.rowCount > 0;
  }

  /**
   * List users with pagination
   */
  static async list({ page = 1, limit = 20 }) {
    const offset = (page - 1) * limit;
    
    const [users, count] = await Promise.all([
      query(
        `SELECT id, email, name, is_active, created_at
         FROM users
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      query('SELECT COUNT(*) as total FROM users'),
    ]);

    return {
      data: users.rows,
      total: parseInt(count.rows[0].total, 10),
      page,
      limit,
    };
  }
}

module.exports = User;

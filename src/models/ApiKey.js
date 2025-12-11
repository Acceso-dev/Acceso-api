/**
 * API Key Model
 */

const { query } = require('../config/database');
const { generateApiKey, hashApiKey } = require('../utils/crypto');
const logger = require('../utils/logger');

class ApiKey {
  /**
   * Create a new API key
   */
  static async create({ userId, name, tier = 'free', expiresAt = null }) {
    const rawKey = generateApiKey();
    const keyHash = await hashApiKey(rawKey);
    
    // Store using PostgreSQL crypt function for secure comparison
    const result = await query(
      `INSERT INTO api_keys (
        user_id, name, key_hash, key_prefix, tier, is_active, expires_at, created_at
       )
       VALUES ($1, $2, crypt($3, gen_salt('bf')), $4, $5, true, $6, NOW())
       RETURNING id, name, key_prefix, tier, is_active, expires_at, created_at`,
      [userId, name, rawKey, rawKey.substring(0, 12), tier, expiresAt]
    );

    return {
      ...result.rows[0],
      key: rawKey, // Only returned once at creation
    };
  }

  /**
   * Find API key by ID
   */
  static async findById(id) {
    const result = await query(
      `SELECT id, user_id, name, key_prefix, tier, is_active, expires_at, 
              last_used_at, created_at
       FROM api_keys WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Validate API key and return associated data
   */
  static async validate(rawKey) {
    const result = await query(
      `SELECT 
        ak.id,
        ak.user_id,
        ak.name,
        ak.tier,
        ak.is_active,
        ak.expires_at,
        u.email,
        u.is_active as user_active
       FROM api_keys ak
       JOIN users u ON ak.user_id = u.id
       WHERE ak.key_hash = crypt($1, ak.key_hash)
       LIMIT 1`,
      [rawKey]
    );
    
    return result.rows[0] || null;
  }

  /**
   * List API keys for a user
   */
  static async listByUser(userId, { page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    
    const [keys, count] = await Promise.all([
      query(
        `SELECT id, name, key_prefix, tier, is_active, expires_at, 
                last_used_at, created_at
         FROM api_keys
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      ),
      query('SELECT COUNT(*) as total FROM api_keys WHERE user_id = $1', [userId]),
    ]);

    return {
      data: keys.rows,
      total: parseInt(count.rows[0].total, 10),
      page,
      limit,
    };
  }

  /**
   * Update API key
   */
  static async update(id, userId, updates) {
    const { name, is_active } = updates;
    const result = await query(
      `UPDATE api_keys 
       SET name = COALESCE($3, name),
           is_active = COALESCE($4, is_active)
       WHERE id = $1 AND user_id = $2
       RETURNING id, name, key_prefix, tier, is_active, expires_at`,
      [id, userId, name, is_active]
    );
    return result.rows[0] || null;
  }

  /**
   * Revoke (delete) API key
   */
  static async revoke(id, userId) {
    const result = await query(
      'UPDATE api_keys SET is_active = false WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return result.rowCount > 0;
  }

  /**
   * Update last used timestamp
   */
  static async updateLastUsed(id) {
    await query(
      'UPDATE api_keys SET last_used_at = NOW() WHERE id = $1',
      [id]
    );
  }

  /**
   * Rotate API key (create new, revoke old)
   */
  static async rotate(id, userId) {
    const existing = await this.findById(id);
    if (!existing || existing.user_id !== userId) {
      return null;
    }

    // Revoke old key
    await this.revoke(id, userId);

    // Create new key with same settings
    return this.create({
      userId,
      name: `${existing.name} (rotated)`,
      tier: existing.tier,
      expiresAt: existing.expires_at,
    });
  }
}

module.exports = ApiKey;

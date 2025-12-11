/**
 * Usage Metrics Model
 */

const { query } = require('../config/database');
const logger = require('../utils/logger');

class UsageMetrics {
  /**
   * Record API usage
   */
  static async record({
    userId,
    apiKeyId,
    endpoint,
    method,
    statusCode,
    responseTimeMs,
    requestId,
    ipAddress,
  }) {
    try {
      await query(
        `INSERT INTO usage_metrics (
          user_id, api_key_id, endpoint, method, status_code,
          response_time_ms, request_id, ip_address, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [userId, apiKeyId, endpoint, method, statusCode, responseTimeMs, requestId, ipAddress]
      );
    } catch (error) {
      logger.error('Failed to record usage metrics:', error.message);
    }
  }

  /**
   * Get usage summary for user
   */
  static async getSummary(userId, { startDate, endDate }) {
    const result = await query(
      `SELECT 
        COUNT(*) as total_requests,
        AVG(response_time_ms)::integer as avg_response_time,
        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count,
        COUNT(CASE WHEN status_code = 429 THEN 1 END) as rate_limit_count
       FROM usage_metrics
       WHERE user_id = $1
         AND created_at >= $2
         AND created_at <= $3`,
      [userId, startDate, endDate]
    );
    return result.rows[0];
  }

  /**
   * Get usage by endpoint
   */
  static async getByEndpoint(userId, { startDate, endDate, limit = 10 }) {
    const result = await query(
      `SELECT 
        endpoint,
        COUNT(*) as request_count,
        AVG(response_time_ms)::integer as avg_response_time
       FROM usage_metrics
       WHERE user_id = $1
         AND created_at >= $2
         AND created_at <= $3
       GROUP BY endpoint
       ORDER BY request_count DESC
       LIMIT $4`,
      [userId, startDate, endDate, limit]
    );
    return result.rows;
  }

  /**
   * Get daily usage stats
   */
  static async getDailyStats(userId, { days = 30 }) {
    const result = await query(
      `SELECT 
        DATE(created_at) as date,
        COUNT(*) as request_count,
        AVG(response_time_ms)::integer as avg_response_time,
        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count
       FROM usage_metrics
       WHERE user_id = $1
         AND created_at >= NOW() - INTERVAL '1 day' * $2
       GROUP BY DATE(created_at)
       ORDER BY date DESC`,
      [userId, days]
    );
    return result.rows;
  }

  /**
   * Get usage by API key
   */
  static async getByApiKey(apiKeyId, { startDate, endDate }) {
    const result = await query(
      `SELECT 
        COUNT(*) as total_requests,
        AVG(response_time_ms)::integer as avg_response_time,
        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count
       FROM usage_metrics
       WHERE api_key_id = $1
         AND created_at >= $2
         AND created_at <= $3`,
      [apiKeyId, startDate, endDate]
    );
    return result.rows[0];
  }

  /**
   * Cleanup old metrics (retention policy)
   */
  static async cleanup(retentionDays = 90) {
    const result = await query(
      `DELETE FROM usage_metrics 
       WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
      [retentionDays]
    );
    logger.info(`Cleaned up ${result.rowCount} old usage metrics`);
    return result.rowCount;
  }
}

module.exports = UsageMetrics;

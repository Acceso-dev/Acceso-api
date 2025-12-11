/**
 * Price Cache Model (for Polymarket prices)
 */

const { query } = require('../config/database');
const { cache } = require('../config/redis');
const logger = require('../utils/logger');

class PriceCache {
  /**
   * Store price in database (for history)
   */
  static async store({ marketId, price, volume, timestamp }) {
    const result = await query(
      `INSERT INTO price_cache (market_id, price, volume, timestamp, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (market_id, timestamp) DO UPDATE
       SET price = $2, volume = $3
       RETURNING *`,
      [marketId, price, volume, timestamp]
    );
    return result.rows[0];
  }

  /**
   * Get latest price from Redis cache
   */
  static async getLatest(marketId) {
    const cacheKey = `price:${marketId}:latest`;
    return cache.get(cacheKey);
  }

  /**
   * Set latest price in Redis cache
   */
  static async setLatest(marketId, data, ttlSeconds = 5) {
    const cacheKey = `price:${marketId}:latest`;
    return cache.set(cacheKey, data, ttlSeconds);
  }

  /**
   * Get price history
   */
  static async getHistory(marketId, { startTime, endTime, interval = '1h' }) {
    // Interval can be: 1m, 5m, 15m, 1h, 4h, 1d
    const intervalMap = {
      '1m': '1 minute',
      '5m': '5 minutes',
      '15m': '15 minutes',
      '1h': '1 hour',
      '4h': '4 hours',
      '1d': '1 day',
    };

    const result = await query(
      `SELECT 
        date_trunc($4, timestamp) as time,
        AVG(price) as price,
        SUM(volume) as volume,
        MIN(price) as low,
        MAX(price) as high,
        (array_agg(price ORDER BY timestamp ASC))[1] as open,
        (array_agg(price ORDER BY timestamp DESC))[1] as close
       FROM price_cache
       WHERE market_id = $1
         AND timestamp >= $2
         AND timestamp <= $3
       GROUP BY date_trunc($4, timestamp)
       ORDER BY time ASC`,
      [marketId, startTime, endTime, intervalMap[interval] || '1 hour']
    );
    return result.rows;
  }

  /**
   * Get latest prices for multiple markets
   */
  static async getLatestBatch(marketIds) {
    const prices = await Promise.all(
      marketIds.map(async (id) => {
        const price = await this.getLatest(id);
        return { marketId: id, ...price };
      })
    );
    return prices.filter((p) => p.price !== null);
  }

  /**
   * Cleanup old price data
   */
  static async cleanup(retentionDays = 30) {
    const result = await query(
      `DELETE FROM price_cache 
       WHERE timestamp < NOW() - INTERVAL '1 day' * $1`,
      [retentionDays]
    );
    return result.rowCount;
  }

  /**
   * Get OHLCV candles
   */
  static async getOHLCV(marketId, { startTime, endTime, interval = '1h' }) {
    return this.getHistory(marketId, { startTime, endTime, interval });
  }
}

module.exports = PriceCache;

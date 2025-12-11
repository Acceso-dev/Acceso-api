/**
 * Polymarket Data API Service
 * User data, holdings, and on-chain activities
 * 
 * Endpoints:
 * - https://data-api.polymarket.com/ (user data)
 * - https://lb-api.polymarket.com/ (leaderboard)
 */

const axios = require('axios');
const logger = require('../utils/logger');
const { redis } = require('../config/redis');

class PolymarketDataService {
  constructor() {
    this.baseUrl = 'https://data-api.polymarket.com';
    this.lbApiUrl = 'https://lb-api.polymarket.com';
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    // Leaderboard API client
    this.lbClient = axios.create({
      baseURL: this.lbApiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    // Add response interceptor for logging
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('Polymarket Data API error:', {
          url: error.config?.url,
          status: error.response?.status,
          message: error.message,
        });
        throw error;
      }
    );

    this.lbClient.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('Polymarket LB API error:', {
          url: error.config?.url,
          status: error.response?.status,
          message: error.message,
        });
        throw error;
      }
    );

    // Gamma API client (for events, markets metadata)
    this.gammaApiUrl = 'https://gamma-api.polymarket.com';
    this.gammaClient = axios.create({
      baseURL: this.gammaApiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    this.gammaClient.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('Polymarket Gamma API error:', {
          url: error.config?.url,
          status: error.response?.status,
          message: error.message,
        });
        throw error;
      }
    );
  }

  /**
   * Get cached data or fetch fresh
   */
  async getCached(key, fetchFn, ttl = 60) {
    try {
      const cached = await redis.get(key);
      if (cached) {
        logger.debug(`Cache hit: ${key}`);
        return JSON.parse(cached);
      }
    } catch (err) {
      logger.warn(`Cache error: ${err.message}`);
    }

    const data = await fetchFn();
    
    try {
      await redis.setEx(key, ttl, JSON.stringify(data));
    } catch (err) {
      logger.warn(`Cache set error: ${err.message}`);
    }

    return data;
  }

  /**
   * Get user profile data
   */
  async getUserProfile(address) {
    const cacheKey = `polymarket:user:${address}`;
    
    return this.getCached(cacheKey, async () => {
      const response = await this.client.get(`/users/${address}`);
      return response.data;
    }, 300); // 5 min cache
  }

  /**
   * Get user positions/holdings
   */
  async getUserPositions(address, options = {}) {
    const { limit = 100, offset = 0 } = options;
    const cacheKey = `polymarket:positions:${address}:${limit}:${offset}`;
    
    return this.getCached(cacheKey, async () => {
      const response = await this.client.get(`/users/${address}/positions`, {
        params: { limit, offset },
      });
      return response.data;
    }, 60); // 1 min cache
  }

  /**
   * Get user trade history
   */
  async getUserTrades(address, options = {}) {
    const { limit = 100, offset = 0, market } = options;
    const cacheKey = `polymarket:trades:${address}:${limit}:${offset}:${market || 'all'}`;
    
    return this.getCached(cacheKey, async () => {
      const params = { limit, offset };
      if (market) params.market = market;
      
      const response = await this.client.get(`/users/${address}/trades`, {
        params,
      });
      return response.data;
    }, 30); // 30 sec cache
  }

  /**
   * Get user orders (open orders)
   */
  async getUserOrders(address, options = {}) {
    const { limit = 100, offset = 0, status = 'open' } = options;
    
    const response = await this.client.get(`/users/${address}/orders`, {
      params: { limit, offset, status },
    });
    return response.data;
  }

  /**
   * Get user PnL (Profit and Loss)
   */
  async getUserPnL(address) {
    const cacheKey = `polymarket:pnl:${address}`;
    
    return this.getCached(cacheKey, async () => {
      const response = await this.client.get(`/users/${address}/pnl`);
      return response.data;
    }, 60);
  }

  /**
   * Get user activity feed
   */
  async getUserActivity(address, options = {}) {
    const { limit = 50, offset = 0 } = options;
    
    const response = await this.client.get(`/users/${address}/activity`, {
      params: { limit, offset },
    });
    return response.data;
  }

  /**
   * Get market details
   */
  async getMarket(conditionId) {
    const cacheKey = `polymarket:data:market:${conditionId}`;
    
    return this.getCached(cacheKey, async () => {
      const response = await this.client.get(`/markets/${conditionId}`);
      return response.data;
    }, 60);
  }

  /**
   * Get market trades
   */
  async getMarketTrades(conditionId, options = {}) {
    const { limit = 100, offset = 0 } = options;
    
    const response = await this.client.get(`/markets/${conditionId}/trades`, {
      params: { limit, offset },
    });
    return response.data;
  }

  /**
   * Get market positions (all holders)
   */
  async getMarketPositions(conditionId, options = {}) {
    const { limit = 100, offset = 0 } = options;
    const cacheKey = `polymarket:data:positions:${conditionId}:${limit}:${offset}`;
    
    return this.getCached(cacheKey, async () => {
      const response = await this.client.get(`/markets/${conditionId}/positions`, {
        params: { limit, offset },
      });
      return response.data;
    }, 120);
  }

  /**
   * Get global leaderboard (profit or volume rankings)
   * Uses lb-api.polymarket.com
   */
  async getLeaderboard(options = {}) {
    const { limit = 100, offset = 0, timeframe = 'all', type = 'profit' } = options;
    const cacheKey = `polymarket:leaderboard:${type}:${timeframe}:${limit}:${offset}`;
    
    return this.getCached(cacheKey, async () => {
      // lb-api has /profit and /volume endpoints
      const endpoint = type === 'volume' ? '/volume' : '/profit';
      const response = await this.lbClient.get(endpoint);
      
      // API returns array, apply pagination manually
      let data = response.data || [];
      
      // Apply offset and limit
      data = data.slice(offset, offset + limit);
      
      // Format response
      return {
        type,
        timeframe,
        count: data.length,
        total: response.data?.length || 0,
        leaders: data.map((user, index) => ({
          rank: offset + index + 1,
          wallet: user.proxyWallet,
          name: user.pseudonym || user.name || 'Anonymous',
          amount: user.amount,
          amount_formatted: type === 'volume' 
            ? `$${(user.amount / 1000000).toFixed(2)}M` 
            : `$${user.amount.toLocaleString()}`,
          profile_image: user.profileImageOptimized || user.profileImage || null,
          bio: user.bio || null,
        })),
      };
    }, 300); // 5 min cache
  }

  /**
   * Get trending markets (from gamma API, sorted by volume)
   */
  async getTrendingMarkets(options = {}) {
    const { limit = 20 } = options;
    const cacheKey = `polymarket:trending:${limit}`;
    
    return this.getCached(cacheKey, async () => {
      // Gamma API: get active markets sorted by volume
      const response = await this.gammaClient.get('/markets', {
        params: { 
          limit, 
          active: true, 
          closed: false,
          order: 'volume',
          ascending: false,
        },
      });
      return response.data;
    }, 180); // 3 min cache
  }

  /**
   * Get featured markets (from gamma API)
   */
  async getFeaturedMarkets() {
    const cacheKey = 'polymarket:featured';
    
    return this.getCached(cacheKey, async () => {
      // Gamma API: get featured markets
      const response = await this.gammaClient.get('/markets', {
        params: { 
          featured: true,
          active: true,
          limit: 20,
        },
      });
      return response.data;
    }, 300); // 5 min cache
  }

  /**
   * Get market volume history
   */
  async getMarketVolume(conditionId, options = {}) {
    const { interval = '1d', limit = 30 } = options;
    const cacheKey = `polymarket:volume:${conditionId}:${interval}:${limit}`;
    
    return this.getCached(cacheKey, async () => {
      const response = await this.client.get(`/markets/${conditionId}/volume`, {
        params: { interval, limit },
      });
      return response.data;
    }, 300);
  }

  /**
   * Get price history for a market
   */
  async getPriceHistory(tokenId, options = {}) {
    const { interval = '1h', limit = 168 } = options; // Default 7 days of hourly data
    const cacheKey = `polymarket:priceHistory:${tokenId}:${interval}:${limit}`;
    
    return this.getCached(cacheKey, async () => {
      const response = await this.client.get(`/prices/${tokenId}/history`, {
        params: { interval, limit },
      });
      return response.data;
    }, 60);
  }

  /**
   * Search markets
   */
  async searchMarkets(query, options = {}) {
    const { limit = 20, offset = 0 } = options;
    
    const response = await this.client.get('/markets/search', {
      params: { q: query, limit, offset },
    });
    return response.data;
  }

  /**
   * Get events (grouping of related markets) from gamma API
   */
  async getEvents(options = {}) {
    const { limit = 20, offset = 0, active = true } = options;
    const cacheKey = `polymarket:events:${limit}:${offset}:${active}`;
    
    return this.getCached(cacheKey, async () => {
      const response = await this.gammaClient.get('/events', {
        params: { limit, offset, active },
      });
      return response.data;
    }, 300);
  }

  /**
   * Get event details from gamma API
   */
  async getEvent(eventId) {
    const cacheKey = `polymarket:event:${eventId}`;
    
    return this.getCached(cacheKey, async () => {
      const response = await this.gammaClient.get(`/events/${eventId}`);
      return response.data;
    }, 300);
  }
}

// Singleton instance
const polymarketData = new PolymarketDataService();

module.exports = polymarketData;

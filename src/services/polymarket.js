/**
 * Polymarket Service
 * Handles Polymarket API interactions
 * 
 * IMPORTANT: Fetches only CURRENT/REAL-TIME markets, not historical data
 */

const axios = require('axios');
const { getOrSet, cache } = require('../utils/cache');
const logger = require('../utils/logger');
const { CACHE_TTL } = require('../config/constants');
const { PriceCache } = require('../models');

// Polymarket API endpoints
const POLYMARKET_API = process.env.POLYMARKET_API_URL || 'https://clob.polymarket.com';
const GAMMA_API = process.env.POLYMARKET_GAMMA_URL || 'https://gamma-api.polymarket.com';

// Axios instance with defaults
const api = axios.create({
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Parse stringified JSON array (Gamma API returns stringified arrays)
 */
function parseJsonField(field) {
  if (!field) return [];
  if (Array.isArray(field)) return field;
  try {
    return JSON.parse(field);
  } catch {
    return [];
  }
}

/**
 * Filter to only include current/future markets (not past/closed)
 */
function isCurrentMarket(market) {
  // Must not be closed
  if (market.closed === true) return false;
  
  // Must have liquidity or recent volume
  const hasActivity = parseFloat(market.liquidity || 0) > 0 || 
                      parseFloat(market.volume24hr || 0) > 0 ||
                      parseFloat(market.volume1wk || 0) > 0;
  
  // End date must be in the future (if it exists)
  if (market.endDate || market.end_date_iso) {
    const endDate = new Date(market.endDate || market.end_date_iso);
    if (endDate < new Date()) return false;
  }
  
  return hasActivity || !market.endDate;
}

/**
 * List markets - ONLY CURRENT/ACTIVE markets with real-time data
 */
async function listMarkets({ page = 1, limit = 20, status = 'active', category, search, sort = 'volume', order = 'desc' }) {
  // Short cache for real-time data (30 seconds)
  const cacheKey = `polymarket:markets:v2:${page}:${limit}:${status}:${category || 'all'}:${search || 'none'}:${sort}:${order}`;
  
  return getOrSet(cacheKey, 30, async () => {
    try {
      // Fetch more than needed to filter out old markets
      const fetchLimit = Math.min(limit * 3, 100);
      
      const response = await api.get(`${GAMMA_API}/markets`, {
        params: {
          limit: fetchLimit,
          offset: (page - 1) * limit,
          closed: false,  // Only open markets
          active: true,   // Only active markets
          order: sort === 'volume' ? 'volume24hr' : sort,
          ascending: order === 'asc',
          // Search query if provided
          ...(search && { _q: search }),
          ...(category && { tag_slug: category }),
        },
      });

      // Filter to only current markets and transform
      const markets = response.data
        .filter(isCurrentMarket)
        .slice(0, limit)
        .map((market) => {
          const outcomePrices = parseJsonField(market.outcomePrices);
          const outcomes = parseJsonField(market.outcomes);
          
          return {
            id: market.id,
            slug: market.slug,
            question: market.question,
            description: market.description,
            category: market.category || market.tags?.[0]?.label,
            status: market.closed ? 'closed' : 'active',
            end_date: market.endDate || market.end_date_iso,
            volume: market.volume,
            volume_24h: market.volume24hr,
            liquidity: market.liquidity,
            outcomes,
            yes_price: outcomePrices[0] || null,
            no_price: outcomePrices[1] || null,
            image: market.image,
            created_at: market.createdAt,
            updated_at: market.updatedAt,
          };
        });

      return markets;
    } catch (error) {
      logger.error('Polymarket listMarkets error:', error.message);
      throw error;
    }
  });
}

/**
 * Search markets - Real-time search for current markets only
 */
async function searchMarkets(query, { limit = 20, offset = 0 } = {}) {
  const cacheKey = `polymarket:search:${query}:${limit}:${offset}`;
  
  return getOrSet(cacheKey, 30, async () => {
    try {
      const response = await api.get(`${GAMMA_API}/markets`, {
        params: {
          _q: query,
          limit: limit * 2,
          offset,
          closed: false,
          active: true,
        },
      });

      return response.data
        .filter(isCurrentMarket)
        .slice(0, limit)
        .map((market) => {
          const outcomePrices = parseJsonField(market.outcomePrices);
          const outcomes = parseJsonField(market.outcomes);
          
          return {
            id: market.id,
            slug: market.slug,
            question: market.question,
            category: market.category,
            volume: market.volume,
            volume_24h: market.volume24hr,
            liquidity: market.liquidity,
            outcomes,
            yes_price: outcomePrices[0] || null,
            no_price: outcomePrices[1] || null,
            end_date: market.endDate || market.end_date_iso,
          };
        });
    } catch (error) {
      logger.error('Polymarket searchMarkets error:', error.message);
      throw error;
    }
  });
}

/**
 * Get trending/popular markets - Only current high-volume markets
 */
async function getTrendingMarkets(limit = 10) {
  const cacheKey = `polymarket:trending:${limit}`;
  
  return getOrSet(cacheKey, 60, async () => {
    try {
      const response = await api.get(`${GAMMA_API}/markets`, {
        params: {
          limit: limit * 3,
          closed: false,
          active: true,
          order: 'volume24hr',
          ascending: false,
        },
      });

      return response.data
        .filter(isCurrentMarket)
        .filter(m => parseFloat(m.volume24hr || 0) > 0)
        .slice(0, limit)
        .map((market) => {
          const outcomePrices = parseJsonField(market.outcomePrices);
          const outcomes = parseJsonField(market.outcomes);
          
          return {
            id: market.id,
            slug: market.slug,
            question: market.question,
            category: market.category,
            volume_24h: market.volume24hr,
            volume_total: market.volume,
            liquidity: market.liquidity,
            outcomes,
            yes_price: outcomePrices[0] || null,
            no_price: outcomePrices[1] || null,
            image: market.image,
          };
        });
    } catch (error) {
      logger.error('Polymarket getTrendingMarkets error:', error.message);
      throw error;
    }
  });
}

/**
 * Get market details
 */
async function getMarket(marketId) {
  const cacheKey = `polymarket:market:${marketId}`;
  
  return getOrSet(cacheKey, CACHE_TTL.MARKET_DETAILS, async () => {
    try {
      const response = await api.get(`${GAMMA_API}/markets/${marketId}`);
      const market = response.data;
      
      const outcomePrices = parseJsonField(market.outcomePrices);
      const outcomes = parseJsonField(market.outcomes);
      const tokens = parseJsonField(market.tokens);

      return {
        id: market.id,
        condition_id: market.condition_id,
        question: market.question,
        description: market.description,
        category: market.tags?.[0]?.label,
        status: market.closed ? 'closed' : 'active',
        end_date: market.end_date_iso,
        resolution_source: market.resolution_source,
        volume: market.volume,
        liquidity: market.liquidity,
        outcomes,
        yes_price: outcomePrices[0] || null,
        no_price: outcomePrices[1] || null,
        tokens,
        created_at: market.created_at,
      };
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      logger.error('Polymarket getMarket error:', error.message);
      throw error;
    }
  });
}

/**
 * Get current price
 */
async function getPrice(marketId) {
  const cacheKey = `polymarket:price:${marketId}`;
  
  return getOrSet(cacheKey, CACHE_TTL.MARKET_PRICE, async () => {
    try {
      // Get from Gamma API - already has prices embedded
      const response = await api.get(`${GAMMA_API}/markets/${marketId}`);
      const market = response.data;
      
      if (!market) {
        return null;
      }
      
      const outcomePrices = parseJsonField(market.outcomePrices);
      
      const result = {
        price: outcomePrices[0] || null,
        yes_price: outcomePrices[0] || null,
        no_price: outcomePrices[1] || null,
        volume_24h: market.volume24hr,
        liquidity: market.liquidity,
        updated_at: new Date().toISOString(),
      };

      return result;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      logger.error('Polymarket getPrice error:', error.message);
      throw error;
    }
  });
}

/**
 * Get price history
 */
async function getPriceHistory(marketId, { interval = '1h', startTime, endTime, limit = 100 }) {
  const cacheKey = `polymarket:history:${marketId}:${interval}:${limit}`;
  
  return getOrSet(cacheKey, 60, async () => {
    try {
      // First get market to get the clobTokenIds
      const marketResponse = await api.get(`${GAMMA_API}/markets/${marketId}`);
      const market = marketResponse.data;
      
      if (!market) {
        return [];
      }
      
      const clobTokenIds = parseJsonField(market.clobTokenIds);
      if (!clobTokenIds.length) {
        return [];
      }
      
      // Use the first token (YES outcome) for price history
      const tokenId = clobTokenIds[0];
      
      // Map interval to fidelity (in minutes)
      const fidelityMap = { '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1d': 1440 };
      const fidelity = fidelityMap[interval] || 60;
      
      const response = await api.get(`${POLYMARKET_API}/prices-history`, {
        params: {
          market: tokenId,
          interval,
          fidelity,
        },
      });

      return response.data.history?.map((point) => ({
        time: new Date(point.t * 1000).toISOString(),
        price: point.p,
      })) || [];
    } catch (error) {
      logger.error('Polymarket getPriceHistory error:', error.message);
      throw error;
    }
  });
}

/**
 * Get orderbook
 */
async function getOrderbook(marketId, depth = 10) {
  const cacheKey = `polymarket:orderbook:${marketId}:${depth}`;
  
  return getOrSet(cacheKey, CACHE_TTL.ORDERBOOK, async () => {
    try {
      // First get market to get the clobTokenIds
      const marketResponse = await api.get(`${GAMMA_API}/markets/${marketId}`);
      const market = marketResponse.data;
      
      if (!market) {
        return null;
      }
      
      const clobTokenIds = parseJsonField(market.clobTokenIds);
      if (!clobTokenIds.length) {
        return { bids: [], asks: [], spread: null, updated_at: new Date().toISOString() };
      }
      
      // Use the first token (YES outcome) for orderbook
      const tokenId = clobTokenIds[0];
      
      const response = await api.get(`${POLYMARKET_API}/book`, {
        params: { token_id: tokenId },
      });

      const orderbook = response.data;
      
      // Calculate spread
      const bestBid = orderbook.bids?.[0]?.price ? parseFloat(orderbook.bids[0].price) : null;
      const bestAsk = orderbook.asks?.[0]?.price ? parseFloat(orderbook.asks[0].price) : null;
      const spread = bestBid && bestAsk ? (bestAsk - bestBid).toFixed(4) : null;
      
      return {
        bids: orderbook.bids?.slice(0, depth) || [],
        asks: orderbook.asks?.slice(0, depth) || [],
        spread,
        updated_at: new Date().toISOString(),
      };
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      logger.error('Polymarket getOrderbook error:', error.message);
      throw error;
    }
  });
}

/**
 * Get categories
 */
async function getCategories() {
  const cacheKey = 'polymarket:categories';
  
  return getOrSet(cacheKey, 3600, async () => {
    try {
      const response = await api.get(`${GAMMA_API}/tags`);
      return response.data.map((tag) => ({
        id: tag.id,
        slug: tag.slug,
        label: tag.label,
        market_count: tag.market_count,
      }));
    } catch (error) {
      logger.error('Polymarket getCategories error:', error.message);
      throw error;
    }
  });
}

/**
 * Get trending markets
 */
async function getTrending() {
  const cacheKey = 'polymarket:trending';
  
  return getOrSet(cacheKey, 300, async () => {
    try {
      const response = await api.get(`${GAMMA_API}/markets`, {
        params: {
          limit: 10,
          active: true,
          order: 'volume',
          ascending: false,
        },
      });

      return response.data.map((market) => ({
        id: market.id,
        question: market.question,
        volume: market.volume,
        yes_price: market.outcomePrices?.[0],
        volume_change_24h: market.volume_change_24h,
      }));
    } catch (error) {
      logger.error('Polymarket getTrending error:', error.message);
      throw error;
    }
  });
}

module.exports = {
  listMarkets,
  searchMarkets,
  getTrendingMarkets,
  getMarket,
  getPrice,
  getPriceHistory,
  getOrderbook,
  getCategories,
  getTrending: getTrendingMarkets,  // Alias for backward compatibility
};

/**
 * Polymarket Routes
 * Market data and prices
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../../../middleware/errorHandler');
const { validateQuery, validateParams, Joi } = require('../../../middleware/validation');
const { successResponse, errorResponse, paginatedResponse } = require('../../../utils/response');
const PolymarketService = require('../../../services/polymarket');
const polymarketData = require('../../../services/polymarketData');
const logger = require('../../../utils/logger');

// Validation schemas
const schemas = {
  marketId: Joi.object({
    id: Joi.string().required(),
  }),
  listMarkets: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    status: Joi.string().valid('active', 'closed', 'all').default('active'),
    category: Joi.string(),
    search: Joi.string().max(100),
    sort: Joi.string().valid('volume', 'liquidity', 'created', 'end_date').default('volume'),
    order: Joi.string().valid('asc', 'desc').default('desc'),
  }),
  priceHistory: Joi.object({
    interval: Joi.string().valid('1m', '5m', '15m', '1h', '4h', '1d').default('1h'),
    start: Joi.date().iso(),
    end: Joi.date().iso(),
    limit: Joi.number().integer().min(1).max(1000).default(100),
  }),
  orderbook: Joi.object({
    depth: Joi.number().integer().min(1).max(50).default(10),
  }),
};

/**
 * GET /v1/polymarket/markets
 * List all markets
 */
router.get(
  '/markets',
  validateQuery(schemas.listMarkets),
  asyncHandler(async (req, res) => {
    const { page, limit, status, category, search, sort, order } = req.query;

    const result = await PolymarketService.listMarkets({
      page,
      limit,
      status,
      category,
      search,
      sort,
      order,
    });

    return paginatedResponse(res, result.data, {
      page,
      limit,
      total: result.total,
    }, { cached: result.cached });
  })
);

/**
 * GET /v1/polymarket/markets/featured
 * Get featured/highlighted markets
 */
router.get(
  '/markets/featured',
  asyncHandler(async (req, res) => {
    const data = await polymarketData.getFeaturedMarkets();
    return successResponse(res, data);
  })
);

/**
 * GET /v1/polymarket/markets/:id
 * Get market details
 */
router.get(
  '/markets/:id',
  validateParams(schemas.marketId),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await PolymarketService.getMarket(id);

    if (!result.data) {
      return errorResponse(res, 'MARKET_NOT_FOUND', 'Market not found', 404);
    }

    return successResponse(res, result.data, { cached: result.cached });
  })
);

/**
 * GET /v1/polymarket/markets/:id/price
 * Get current price for a market
 */
router.get(
  '/markets/:id/price',
  validateParams(schemas.marketId),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await PolymarketService.getPrice(id);

    if (!result.data) {
      return errorResponse(res, 'MARKET_NOT_FOUND', 'Market not found', 404);
    }

    return successResponse(res, {
      market_id: id,
      price: result.data.price,
      yes_price: result.data.yes_price,
      no_price: result.data.no_price,
      volume_24h: result.data.volume_24h,
      liquidity: result.data.liquidity,
      updated_at: result.data.updated_at,
    }, { cached: result.cached });
  })
);

/**
 * GET /v1/polymarket/markets/:id/price/history
 * Get price history for a market
 */
router.get(
  '/markets/:id/price/history',
  validateParams(schemas.marketId),
  validateQuery(schemas.priceHistory),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { interval, start, end, limit } = req.query;

    const result = await PolymarketService.getPriceHistory(id, {
      interval,
      startTime: start,
      endTime: end,
      limit,
    });

    return successResponse(res, {
      market_id: id,
      interval,
      candles: result.data,
    }, { cached: result.cached });
  })
);

/**
 * GET /v1/polymarket/markets/:id/orderbook
 * Get orderbook for a market
 */
router.get(
  '/markets/:id/orderbook',
  validateParams(schemas.marketId),
  validateQuery(schemas.orderbook),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { depth } = req.query;

    const result = await PolymarketService.getOrderbook(id, depth);

    if (!result.data) {
      return errorResponse(res, 'MARKET_NOT_FOUND', 'Market not found', 404);
    }

    return successResponse(res, {
      market_id: id,
      bids: result.data.bids,
      asks: result.data.asks,
      spread: result.data.spread,
      updated_at: result.data.updated_at,
    }, { cached: result.cached });
  })
);

/**
 * GET /v1/polymarket/categories
 * List market categories
 */
router.get(
  '/categories',
  asyncHandler(async (req, res) => {
    const result = await PolymarketService.getCategories();
    return successResponse(res, result.data, { cached: result.cached });
  })
);

/**
 * GET /v1/polymarket/trending
 * Get trending markets
 */
router.get(
  '/trending',
  asyncHandler(async (req, res) => {
    const result = await PolymarketService.getTrending();
    return successResponse(res, result.data, { cached: result.cached });
  })
);

// ==============================================
// LEADERBOARD & EVENTS
// ==============================================

/**
 * GET /v1/polymarket/leaderboard
 * Get global leaderboard (profit or volume rankings)
 */
router.get(
  '/leaderboard',
  validateQuery(Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(100),
    offset: Joi.number().integer().min(0).default(0),
    timeframe: Joi.string().valid('day', 'week', 'month', 'all').default('all'),
    type: Joi.string().valid('profit', 'volume').default('profit'),
  })),
  asyncHandler(async (req, res) => {
    const { limit, offset, timeframe, type } = req.query;
    const data = await polymarketData.getLeaderboard({ limit, offset, timeframe, type });
    return successResponse(res, data);
  })
);

/**
 * GET /v1/polymarket/events
 * Get events (grouped markets)
 */
router.get(
  '/events',
  validateQuery(Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(20),
    offset: Joi.number().integer().min(0).default(0),
    active: Joi.boolean().default(true),
  })),
  asyncHandler(async (req, res) => {
    const { limit, offset, active } = req.query;
    const data = await polymarketData.getEvents({ limit, offset, active });
    return successResponse(res, data);
  })
);

/**
 * GET /v1/polymarket/events/:id
 * Get event details
 */
router.get(
  '/events/:id',
  validateParams(Joi.object({
    id: Joi.string().required(),
  })),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const data = await polymarketData.getEvent(id);
    return successResponse(res, data);
  })
);

/**
 * GET /v1/polymarket/search
 * Search markets by keyword
 */
router.get(
  '/search',
  validateQuery(Joi.object({
    q: Joi.string().required().min(2).max(100),
    limit: Joi.number().integer().min(1).max(50).default(20),
    offset: Joi.number().integer().min(0).default(0),
  })),
  asyncHandler(async (req, res) => {
    const { q, limit, offset } = req.query;
    // Use main service for better filtering of current markets
    const result = await PolymarketService.searchMarkets(q, { limit, offset });
    return successResponse(res, {
      query: q,
      count: result.data?.length || 0,
      markets: result.data || [],
    }, { cached: result.cached });
  })
);

/**
 * GET /v1/polymarket/stats
 * Get overall Polymarket statistics
 */
router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    // Get trending markets for stats
    const trending = await PolymarketService.getTrendingMarkets(10);
    
    return successResponse(res, {
      top_markets: trending.data || [],
      total_markets: trending.data?.length || 0,
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;

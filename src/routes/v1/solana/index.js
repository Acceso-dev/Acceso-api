/**
 * Solana Routes
 * Comprehensive Solana blockchain API
 * 
 * Features:
 * - Account data (balance, tokens, NFTs)
 * - Token metadata and prices (via Jupiter)
 * - Balance updates via Bitquery GraphQL
 * - DEX trades (pump.fun, raydium, orca, jupiter)
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../../../middleware/errorHandler');
const { validateBody, validateParams, validateQuery, Joi, commonSchemas } = require('../../../middleware/validation');
const { successResponse, errorResponse } = require('../../../utils/response');
const SolanaService = require('../../../services/solana');
const BitqueryService = require('../../../services/bitquery');
const logger = require('../../../utils/logger');

// Validation schemas
const schemas = {
  address: Joi.object({
    address: commonSchemas.solanaAddress.required(),
  }),
  mint: Joi.object({
    mint: commonSchemas.solanaAddress.required(),
  }),
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(50),
  }),
  tokenPrices: Joi.object({
    mints: Joi.string().required().description('Comma-separated mint addresses'),
  }),
};

// ============================================
// ACCOUNT ENDPOINTS
// ============================================

/**
 * GET /v1/solana/account/:address
 * Get comprehensive account info
 */
router.get(
  '/account/:address',
  validateParams(schemas.address),
  asyncHandler(async (req, res) => {
    const { address } = req.params;

    if (!SolanaService.isValidAddress(address)) {
      return errorResponse(res, 'INVALID_ADDRESS', 'Invalid Solana address', 400);
    }

    const [accountInfo, balanceResult] = await Promise.all([
      SolanaService.getAccountInfo(address),
      SolanaService.getBalance(address),
    ]);

    const balance = balanceResult.data || balanceResult;

    return successResponse(res, {
      address,
      balance: balance.balance,
      lamports: balance.lamports,
      account: accountInfo.data,
    }, { cached: accountInfo.cached });
  })
);

/**
 * GET /v1/solana/account/:address/balance
 * Get SOL balance for an address
 */
router.get(
  '/account/:address/balance',
  validateParams(schemas.address),
  asyncHandler(async (req, res) => {
    const { address } = req.params;

    if (!SolanaService.isValidAddress(address)) {
      return errorResponse(res, 'INVALID_ADDRESS', 'Invalid Solana address', 400);
    }

    const result = await SolanaService.getBalance(address);

    return successResponse(res, {
      address,
      balance: result.data?.balance || result.balance,
      lamports: result.data?.lamports || result.lamports,
    }, { cached: result.cached });
  })
);

/**
 * GET /v1/solana/account/:address/tokens
 * Get SPL token holdings
 */
router.get(
  '/account/:address/tokens',
  validateParams(schemas.address),
  asyncHandler(async (req, res) => {
    const { address } = req.params;

    if (!SolanaService.isValidAddress(address)) {
      return errorResponse(res, 'INVALID_ADDRESS', 'Invalid Solana address', 400);
    }

    const result = await SolanaService.getTokenAccounts(address);

    // Get prices for tokens with significant balance
    const tokensWithBalance = result.data?.filter(t => t.balance > 0) || [];
    let prices = {};
    
    if (tokensWithBalance.length > 0 && tokensWithBalance.length <= 10) {
      const mints = tokensWithBalance.map(t => t.mint);
      const priceData = await SolanaService.getTokenPrices(mints);
      prices = Object.fromEntries(priceData.map(p => [p.mint, p.price]));
    }

    return successResponse(res, {
      address,
      count: result.data?.length || 0,
      tokens: (result.data || []).map(t => ({
        ...t,
        price: prices[t.mint] || null,
        value: prices[t.mint] ? t.balance * prices[t.mint] : null,
      })),
    }, { cached: result.cached });
  })
);

// ============================================
// TOKEN ENDPOINTS
// ============================================

/**
 * GET /v1/solana/token/:mint/price
 * Get token price (via Jupiter)
 */
router.get(
  '/token/:mint/price',
  validateParams(schemas.mint),
  asyncHandler(async (req, res) => {
    const { mint } = req.params;

    if (!SolanaService.isValidAddress(mint)) {
      return errorResponse(res, 'INVALID_MINT', 'Invalid mint address', 400);
    }

    const price = await SolanaService.getTokenPrice(mint);

    return successResponse(res, price.data, { cached: price.cached });
  })
);

/**
 * GET /v1/solana/tokens/prices
 * Get multiple token prices
 */
router.get(
  '/tokens/prices',
  validateQuery(schemas.tokenPrices),
  asyncHandler(async (req, res) => {
    const { mints } = req.query;
    const mintArray = mints.split(',').map(m => m.trim()).filter(Boolean);

    if (mintArray.length === 0) {
      return errorResponse(res, 'NO_MINTS', 'Provide at least one mint address', 400);
    }

    if (mintArray.length > 50) {
      return errorResponse(res, 'TOO_MANY_MINTS', 'Maximum 50 mints per request', 400);
    }

    const prices = await SolanaService.getTokenPrices(mintArray);

    return successResponse(res, {
      count: prices.data?.length || 0,
      prices: prices.data || [],
    }, { cached: prices.cached });
  })
);

// ============================================
// BITQUERY ENDPOINTS (GraphQL Balance Updates)
// ============================================

/**
 * GET /v1/solana/balance-updates
 * Get recent balance updates across the network
 */
router.get(
  '/balance-updates',
  validateQuery(Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(50),
  })),
  asyncHandler(async (req, res) => {
    const { limit } = req.query;

    if (!BitqueryService.isConfigured()) {
      return errorResponse(res, 'NOT_CONFIGURED', 'Bitquery API key not configured', 503);
    }

    const updates = await BitqueryService.getRecentBalanceUpdates(limit);

    return successResponse(res, {
      count: updates.data?.length || 0,
      updates: updates.data || [],
    }, { cached: updates.cached });
  })
);

/**
 * GET /v1/solana/balances/:address
 * Get all token balances for an address (native SOL + SPL tokens)
 * Uses Bitquery GraphQL for accurate balance data
 */
router.get(
  '/balances/:address',
  validateParams(schemas.address),
  asyncHandler(async (req, res) => {
    const { address } = req.params;

    if (!SolanaService.isValidAddress(address)) {
      return errorResponse(res, 'INVALID_ADDRESS', 'Invalid Solana address', 400);
    }

    if (!BitqueryService.isConfigured()) {
      return errorResponse(res, 'NOT_CONFIGURED', 'Bitquery API key not configured', 503);
    }

    const balances = await BitqueryService.getAddressBalances(address);

    return successResponse(res, balances.data || balances, { cached: balances.cached });
  })
);

/**
 * GET /v1/solana/balance-history/:address
 * Get balance change history for an account
 */
router.get(
  '/balance-history/:address',
  validateParams(schemas.address),
  validateQuery(Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(50),
  })),
  asyncHandler(async (req, res) => {
    const { address } = req.params;
    const { limit } = req.query;

    if (!SolanaService.isValidAddress(address)) {
      return errorResponse(res, 'INVALID_ADDRESS', 'Invalid Solana address', 400);
    }

    if (!BitqueryService.isConfigured()) {
      return errorResponse(res, 'NOT_CONFIGURED', 'Bitquery API key not configured', 503);
    }

    const history = await BitqueryService.getBalanceHistory(address, limit);

    return successResponse(res, {
      address,
      count: history.data?.length || 0,
      history: history.data || [],
    }, { cached: history.cached });
  })
);

/**
 * GET /v1/solana/transfers/:address
 * Get token transfers for an address
 */
router.get(
  '/transfers/:address',
  validateParams(schemas.address),
  validateQuery(Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(50),
    mint: Joi.string().optional(),
  })),
  asyncHandler(async (req, res) => {
    const { address } = req.params;
    const { limit, mint } = req.query;

    if (!SolanaService.isValidAddress(address)) {
      return errorResponse(res, 'INVALID_ADDRESS', 'Invalid Solana address', 400);
    }

    if (!BitqueryService.isConfigured()) {
      return errorResponse(res, 'NOT_CONFIGURED', 'Bitquery API key not configured', 503);
    }

    const transfers = await BitqueryService.getTokenTransfers(address, { limit, mint });

    return successResponse(res, {
      address,
      count: transfers.data?.length || 0,
      transfers: transfers.data || [],
    }, { cached: transfers.cached });
  })
);

/**
 * GET /v1/solana/token/:mint/top-holders
 * Get top token holders using Bitquery
 */
router.get(
  '/token/:mint/top-holders',
  validateParams(schemas.mint),
  validateQuery(Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(50),
  })),
  asyncHandler(async (req, res) => {
    const { mint } = req.params;
    const { limit } = req.query;

    if (!SolanaService.isValidAddress(mint)) {
      return errorResponse(res, 'INVALID_MINT', 'Invalid mint address', 400);
    }

    if (!BitqueryService.isConfigured()) {
      return errorResponse(res, 'NOT_CONFIGURED', 'Bitquery API key not configured', 503);
    }

    const holders = await BitqueryService.getTokenHolders(mint, limit);

    return successResponse(res, holders.data || holders, { cached: holders.cached });
  })
);

/**
 * POST /v1/solana/graphql
 * Execute custom Bitquery GraphQL query (advanced users)
 */
router.post(
  '/graphql',
  validateBody(Joi.object({
    query: Joi.string().required().max(10000),
    variables: Joi.object().default({}),
  })),
  asyncHandler(async (req, res) => {
    const { query, variables } = req.body;

    if (!BitqueryService.isConfigured()) {
      return errorResponse(res, 'NOT_CONFIGURED', 'Bitquery API key not configured', 503);
    }

    // Block potentially dangerous queries
    const blockedPatterns = ['mutation', 'subscription'];
    const queryLower = query.toLowerCase();
    for (const pattern of blockedPatterns) {
      if (queryLower.includes(pattern)) {
        return errorResponse(res, 'FORBIDDEN_QUERY', `${pattern} queries are not allowed`, 403);
      }
    }

    try {
      const result = await BitqueryService.executeQuery(query, variables);
      return successResponse(res, result);
    } catch (error) {
      return errorResponse(res, 'GRAPHQL_ERROR', error.message, 400);
    }
  })
);

// ============================================
// HISTORICAL TRANSFERS (Bitquery)
// ============================================

/**
 * GET /v1/solana/transfers/:blockHeight
 * Get historical transfers at a specific block height
 */
router.get(
  '/transfers/:blockHeight',
  validateParams(Joi.object({
    blockHeight: Joi.number().integer().min(0).required(),
  })),
  validateQuery(Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(10),
  })),
  asyncHandler(async (req, res) => {
    const { blockHeight } = req.params;
    const { limit } = req.query;

    if (!BitqueryService.isConfigured()) {
      return errorResponse(res, 'NOT_CONFIGURED', 'Bitquery API key not configured', 503);
    }

    const transfers = await BitqueryService.getHistoricalTransfers(parseInt(blockHeight), limit);

    return successResponse(res, {
      block_height: parseInt(blockHeight),
      count: transfers.data?.length || transfers.length || 0,
      transfers: transfers.data || transfers,
    }, { cached: transfers.cached });
  })
);

// ============================================
// DEX TRADES (Bitquery)
// ============================================

/**
 * GET /v1/solana/trades/token/:mint
 * Get latest trades for a specific token
 */
router.get(
  '/trades/token/:mint',
  validateParams(schemas.mint),
  validateQuery(Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(50),
  })),
  asyncHandler(async (req, res) => {
    const { mint } = req.params;
    const { limit } = req.query;

    if (!SolanaService.isValidAddress(mint)) {
      return errorResponse(res, 'INVALID_MINT', 'Invalid mint address', 400);
    }

    if (!BitqueryService.isConfigured()) {
      return errorResponse(res, 'NOT_CONFIGURED', 'Bitquery API key not configured', 503);
    }

    const trades = await BitqueryService.getTokenTrades(mint, { limit });

    return successResponse(res, {
      mint,
      count: trades.data?.length || trades.length || 0,
      trades: trades.data || trades,
    }, { cached: trades.cached });
  })
);

/**
 * GET /v1/solana/trades/dex/:protocol
 * Get latest trades from a specific DEX protocol
 * Supported: pump, raydium, orca, jupiter, meteora
 */
router.get(
  '/trades/dex/:protocol',
  validateParams(Joi.object({
    protocol: Joi.string().valid('pump', 'raydium', 'orca', 'jupiter', 'meteora', 'lifinity', 'phoenix').required(),
  })),
  validateQuery(Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(50),
  })),
  asyncHandler(async (req, res) => {
    const { protocol } = req.params;
    const { limit } = req.query;

    if (!BitqueryService.isConfigured()) {
      return errorResponse(res, 'NOT_CONFIGURED', 'Bitquery API key not configured', 503);
    }

    const trades = await BitqueryService.getDexTrades({ protocol, limit });

    return successResponse(res, {
      dex: protocol,
      count: trades.data?.length || trades.length || 0,
      trades: trades.data || trades,
    }, { cached: trades.cached });
  })
);

/**
 * GET /v1/solana/trades/pump
 * Get latest pump.fun trades (new token launches)
 */
router.get(
  '/trades/pump',
  validateQuery(Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(50),
  })),
  asyncHandler(async (req, res) => {
    const { limit } = req.query;

    if (!BitqueryService.isConfigured()) {
      return errorResponse(res, 'NOT_CONFIGURED', 'Bitquery API key not configured', 503);
    }

    const trades = await BitqueryService.getPumpFunTrades(limit);

    return successResponse(res, {
      dex: 'pump.fun',
      count: trades.data?.length || trades.length || 0,
      trades: trades.data || trades,
    }, { cached: trades.cached });
  })
);

/**
 * GET /v1/solana/trades/raydium
 * Get latest Raydium DEX trades
 */
router.get(
  '/trades/raydium',
  validateQuery(Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(50),
  })),
  asyncHandler(async (req, res) => {
    const { limit } = req.query;

    if (!BitqueryService.isConfigured()) {
      return errorResponse(res, 'NOT_CONFIGURED', 'Bitquery API key not configured', 503);
    }

    const trades = await BitqueryService.getRaydiumTrades(limit);

    return successResponse(res, {
      dex: 'raydium',
      count: trades.data?.length || trades.length || 0,
      trades: trades.data || trades,
    }, { cached: trades.cached });
  })
);

/**
 * GET /v1/solana/trades/orca
 * Get latest Orca DEX trades
 */
router.get(
  '/trades/orca',
  validateQuery(Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(50),
  })),
  asyncHandler(async (req, res) => {
    const { limit } = req.query;

    if (!BitqueryService.isConfigured()) {
      return errorResponse(res, 'NOT_CONFIGURED', 'Bitquery API key not configured', 503);
    }

    const trades = await BitqueryService.getOrcaTrades(limit);

    return successResponse(res, {
      dex: 'orca',
      count: trades.data?.length || trades.length || 0,
      trades: trades.data || trades,
    }, { cached: trades.cached });
  })
);

/**
 * GET /v1/solana/trades/jupiter
 * Get latest Jupiter aggregator trades
 */
router.get(
  '/trades/jupiter',
  validateQuery(Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(50),
  })),
  asyncHandler(async (req, res) => {
    const { limit } = req.query;

    if (!BitqueryService.isConfigured()) {
      return errorResponse(res, 'NOT_CONFIGURED', 'Bitquery API key not configured', 503);
    }

    const trades = await BitqueryService.getJupiterTrades(limit);

    return successResponse(res, {
      dex: 'jupiter',
      count: trades.data?.length || trades.length || 0,
      trades: trades.data || trades,
    }, { cached: trades.cached });
  })
);

/**
 * GET /v1/solana/token/:mint/ohlcv
 * Get OHLCV (candlestick) price data for a token
 */
router.get(
  '/token/:mint/ohlcv',
  validateParams(schemas.mint),
  validateQuery(Joi.object({
    interval: Joi.string().valid('1m', '5m', '15m', '1h', '4h', '1d').default('1h'),
    limit: Joi.number().integer().min(1).max(500).default(100),
  })),
  asyncHandler(async (req, res) => {
    const { mint } = req.params;
    const { interval, limit } = req.query;

    if (!SolanaService.isValidAddress(mint)) {
      return errorResponse(res, 'INVALID_MINT', 'Invalid mint address', 400);
    }

    if (!BitqueryService.isConfigured()) {
      return errorResponse(res, 'NOT_CONFIGURED', 'Bitquery API key not configured', 503);
    }

    const ohlcv = await BitqueryService.getTokenOHLCV(mint, { interval, limit });

    return successResponse(res, {
      mint,
      interval,
      count: ohlcv.data?.length || ohlcv.length || 0,
      data: ohlcv.data || ohlcv,
    }, { cached: ohlcv.cached });
  })
);

module.exports = router;

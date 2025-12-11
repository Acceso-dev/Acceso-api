/**
 * Solana Service
 * Handles all Solana RPC interactions via Helius
 * 
 * Features:
 * - Account data (balance, tokens, NFTs, transactions)
 * - Token metadata and prices
 * - Transaction details and sending
 * - Network stats
 */

const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const axios = require('axios');
const { getOrSet, cache } = require('../utils/cache');
const logger = require('../utils/logger');
const { CACHE_TTL, SOLANA_NETWORKS } = require('../config/constants');
const { Transaction } = require('../models');

// Helius API configuration
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '8bff5899-6c9b-4630-92a3-2c9a23fd714f';
const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const HELIUS_API_URL = `https://api.helius.xyz/v0`;

// RPC Providers - Helius as primary
const RPC_PROVIDERS = {
  primary: HELIUS_RPC_URL,
  fallback: process.env.SOLANA_RPC_BACKUP_1 || 'https://api.mainnet-beta.solana.com',
  triton: process.env.SOLANA_RPC_BACKUP_2 || 'https://solana-api.projectserum.com',
};

// Provider health status
const providerHealth = {
  primary: { healthy: true, failures: 0, lastCheck: Date.now() },
  fallback: { healthy: true, failures: 0, lastCheck: Date.now() },
  triton: { healthy: true, failures: 0, lastCheck: Date.now() },
};

/**
 * Get healthy RPC endpoint
 */
function getHealthyProvider() {
  if (providerHealth.primary.healthy) {
    return { name: 'primary', url: RPC_PROVIDERS.primary };
  }
  if (RPC_PROVIDERS.fallback && providerHealth.fallback.healthy) {
    return { name: 'fallback', url: RPC_PROVIDERS.fallback };
  }
  if (RPC_PROVIDERS.triton && providerHealth.triton.healthy) {
    return { name: 'triton', url: RPC_PROVIDERS.triton };
  }
  // Reset primary and try again
  providerHealth.primary.healthy = true;
  providerHealth.primary.failures = 0;
  return { name: 'primary', url: RPC_PROVIDERS.primary };
}

/**
 * Mark provider as failed
 */
function markProviderFailed(providerName) {
  if (providerHealth[providerName]) {
    providerHealth[providerName].failures++;
    if (providerHealth[providerName].failures >= 2) {
      providerHealth[providerName].healthy = false;
      logger.warn(`RPC provider ${providerName} marked unhealthy`);
      
      // Reset after 60 seconds
      setTimeout(() => {
        providerHealth[providerName].healthy = true;
        providerHealth[providerName].failures = 0;
        logger.info(`RPC provider ${providerName} reset to healthy`);
      }, 60000);
    }
  }
}

/**
 * Make RPC request with retry logic
 */
async function rpcRequest(method, params, options = {}) {
  const maxRetries = 3;
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const provider = getHealthyProvider();
    
    try {
      const response = await axios.post(
        provider.url,
        {
          jsonrpc: '2.0',
          id: Date.now(),
          method,
          params,
        },
        {
          timeout: 10000,
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (response.data.error) {
        throw new Error(response.data.error.message || 'RPC Error');
      }

      return { data: response.data.result, provider: provider.name };
    } catch (error) {
      lastError = error;
      markProviderFailed(provider.name);
      logger.warn(`RPC request failed (attempt ${attempt + 1}):`, {
        method,
        provider: provider.name,
        error: error.message,
      });
      
      // Exponential backoff
      if (attempt < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
      }
    }
  }

  throw lastError;
}

/**
 * Get SOL balance
 */
async function getBalance(address) {
  const cacheKey = `solana:balance:${address}`;
  
  return getOrSet(cacheKey, CACHE_TTL.BALANCE, async () => {
    const result = await rpcRequest('getBalance', [address]);
    return {
      lamports: result.data.value,
      balance: result.data.value / LAMPORTS_PER_SOL,
    };
  });
}

/**
 * Get account info
 */
async function getAccountInfo(address) {
  const cacheKey = `solana:account:${address}`;
  
  return getOrSet(cacheKey, CACHE_TTL.ACCOUNT_INFO, async () => {
    const result = await rpcRequest('getAccountInfo', [
      address,
      { encoding: 'jsonParsed' },
    ]);
    return result.data;
  });
}

/**
 * Get transaction details
 */
async function getTransaction(signature) {
  const cacheKey = `solana:tx:${signature}`;
  
  return getOrSet(cacheKey, CACHE_TTL.TRANSACTION, async () => {
    const result = await rpcRequest('getTransaction', [
      signature,
      { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
    ]);
    return result.data;
  });
}

/**
 * Send transaction
 */
async function sendTransaction(transaction, options = {}, meta = {}) {
  const result = await rpcRequest('sendTransaction', [
    transaction,
    {
      skipPreflight: options.skipPreflight || false,
      preflightCommitment: options.preflightCommitment || 'confirmed',
      maxRetries: options.maxRetries || 3,
    },
  ]);

  // Record transaction if user is authenticated
  if (meta.userId) {
    await Transaction.create({
      userId: meta.userId,
      signature: result.data,
      type: 'send',
      status: 'pending',
      metadata: { requestId: meta.requestId },
    }).catch((err) => logger.error('Failed to record transaction:', err.message));
  }

  return { signature: result.data };
}

/**
 * Get current slot
 */
async function getSlot() {
  // No caching for slot
  const result = await rpcRequest('getSlot', []);
  return { slot: result.data };
}

/**
 * Get block by slot
 */
async function getBlock(slot) {
  const cacheKey = `solana:block:${slot}`;
  
  return getOrSet(cacheKey, CACHE_TTL.BLOCK, async () => {
    const result = await rpcRequest('getBlock', [
      slot,
      { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
    ]);
    return result.data;
  });
}

/**
 * Get token accounts for an address
 */
async function getTokenAccounts(address) {
  const cacheKey = `solana:tokens:${address}`;
  
  return getOrSet(cacheKey, CACHE_TTL.ACCOUNT_INFO, async () => {
    const result = await rpcRequest('getTokenAccountsByOwner', [
      address,
      { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
      { encoding: 'jsonParsed' },
    ]);
    
    return result.data.value.map((account) => ({
      address: account.pubkey,
      mint: account.account.data.parsed.info.mint,
      balance: account.account.data.parsed.info.tokenAmount.uiAmount,
      decimals: account.account.data.parsed.info.tokenAmount.decimals,
    }));
  });
}

/**
 * Check provider health status
 */
function getProviderStatus() {
  return Object.entries(providerHealth).map(([name, status]) => ({
    name,
    healthy: status.healthy,
    failures: status.failures,
    lastCheck: new Date(status.lastCheck).toISOString(),
  }));
}

// ============================================
// HELIUS ENHANCED API METHODS
// ============================================

/**
 * Get NFTs owned by address (Helius DAS API)
 */
async function getNFTs(address, options = {}) {
  const { page = 1, limit = 50 } = options;
  const cacheKey = `solana:nfts:${address}:${page}:${limit}`;
  
  return getOrSet(cacheKey, 300, async () => {
    try {
      const response = await axios.post(
        HELIUS_RPC_URL,
        {
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'getAssetsByOwner',
          params: {
            ownerAddress: address,
            page,
            limit,
            displayOptions: {
              showFungible: false,
              showNativeBalance: false,
            },
          },
        },
        { timeout: 15000 }
      );

      if (response.data.error) {
        throw new Error(response.data.error.message);
      }

      const assets = response.data.result?.items || [];
      
      return assets.map(nft => ({
        id: nft.id,
        name: nft.content?.metadata?.name || 'Unknown',
        symbol: nft.content?.metadata?.symbol || '',
        description: nft.content?.metadata?.description || '',
        image: nft.content?.links?.image || nft.content?.files?.[0]?.uri || '',
        collection: nft.grouping?.find(g => g.group_key === 'collection')?.group_value || null,
        attributes: nft.content?.metadata?.attributes || [],
        royalty: nft.royalty?.percent || 0,
        owner: nft.ownership?.owner,
        compressed: nft.compression?.compressed || false,
      }));
    } catch (error) {
      logger.error('getNFTs error:', error.message);
      throw error;
    }
  });
}

/**
 * Get transaction history for address (Helius Enhanced API)
 */
async function getTransactionHistory(address, options = {}) {
  const { limit = 50, before, type } = options;
  const cacheKey = `solana:txHistory:${address}:${limit}:${before || 'latest'}:${type || 'all'}`;
  
  return getOrSet(cacheKey, 30, async () => {
    try {
      let url = `${HELIUS_API_URL}/addresses/${address}/transactions?api-key=${HELIUS_API_KEY}&limit=${limit}`;
      if (before) url += `&before=${before}`;
      if (type) url += `&type=${type}`;

      const response = await axios.get(url, { timeout: 15000 });
      
      return response.data.map(tx => ({
        signature: tx.signature,
        type: tx.type,
        description: tx.description,
        fee: tx.fee,
        fee_payer: tx.feePayer,
        slot: tx.slot,
        timestamp: tx.timestamp,
        native_transfers: tx.nativeTransfers?.map(t => ({
          from: t.fromUserAccount,
          to: t.toUserAccount,
          amount: t.amount / LAMPORTS_PER_SOL,
        })) || [],
        token_transfers: tx.tokenTransfers?.map(t => ({
          from: t.fromUserAccount,
          to: t.toUserAccount,
          mint: t.mint,
          amount: t.tokenAmount,
        })) || [],
        source: tx.source,
      }));
    } catch (error) {
      logger.error('getTransactionHistory error:', error.message);
      throw error;
    }
  });
}

/**
 * Get token metadata (Helius DAS API)
 */
async function getTokenMetadata(mintAddress) {
  const cacheKey = `solana:tokenMeta:${mintAddress}`;
  
  return getOrSet(cacheKey, 3600, async () => {
    try {
      const response = await axios.post(
        HELIUS_RPC_URL,
        {
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'getAsset',
          params: { id: mintAddress },
        },
        { timeout: 10000 }
      );

      if (response.data.error) {
        throw new Error(response.data.error.message);
      }

      const asset = response.data.result;
      
      return {
        mint: asset.id,
        name: asset.content?.metadata?.name || 'Unknown',
        symbol: asset.content?.metadata?.symbol || '',
        description: asset.content?.metadata?.description || '',
        image: asset.content?.links?.image || '',
        decimals: asset.token_info?.decimals || 0,
        supply: asset.token_info?.supply || 0,
        token_program: asset.token_info?.token_program || '',
        price_info: asset.token_info?.price_info || null,
      };
    } catch (error) {
      logger.error('getTokenMetadata error:', error.message);
      throw error;
    }
  });
}

/**
 * Get token price from Jupiter
 */
async function getTokenPrice(mintAddress) {
  const cacheKey = `solana:tokenPrice:${mintAddress}`;
  
  return getOrSet(cacheKey, 60, async () => {
    try {
      const response = await axios.get(
        `https://api.jup.ag/price/v2?ids=${mintAddress}`,
        { timeout: 10000 }
      );

      const priceData = response.data.data?.[mintAddress];
      
      if (!priceData) {
        return { price: null, error: 'Price not found' };
      }

      return {
        mint: mintAddress,
        price: priceData.price,
        type: priceData.type,
        extra_info: priceData.extraInfo || null,
      };
    } catch (error) {
      logger.error('getTokenPrice error:', error.message);
      return { price: null, error: error.message };
    }
  });
}

/**
 * Get multiple token prices
 */
async function getTokenPrices(mintAddresses) {
  const cacheKey = `solana:tokenPrices:${mintAddresses.slice(0, 5).join(',')}`;
  
  return getOrSet(cacheKey, 60, async () => {
    try {
      const ids = mintAddresses.join(',');
      const response = await axios.get(
        `https://api.jup.ag/price/v2?ids=${ids}`,
        { timeout: 10000 }
      );

      return Object.entries(response.data.data || {}).map(([mint, data]) => ({
        mint,
        price: data.price,
        type: data.type,
      }));
    } catch (error) {
      logger.error('getTokenPrices error:', error.message);
      return [];
    }
  });
}

/**
 * Get token holders (largest accounts)
 */
async function getTokenHolders(mintAddress, limit = 20) {
  const cacheKey = `solana:tokenHolders:${mintAddress}:${limit}`;
  
  return getOrSet(cacheKey, 300, async () => {
    try {
      const result = await rpcRequest('getTokenLargestAccounts', [mintAddress]);
      
      const holders = result.data.value?.slice(0, limit) || [];
      
      return holders.map((holder, index) => ({
        rank: index + 1,
        address: holder.address,
        amount: holder.uiAmount,
        decimals: holder.decimals,
        amount_raw: holder.amount,
      }));
    } catch (error) {
      logger.error('getTokenHolders error:', error.message);
      throw error;
    }
  });
}

/**
 * Get network stats
 */
async function getNetworkStats() {
  const cacheKey = 'solana:networkStats';
  
  return getOrSet(cacheKey, 30, async () => {
    try {
      // Parallel requests for different stats
      const [slotResult, epochResult, supplyResult, perfResult] = await Promise.all([
        rpcRequest('getSlot', []),
        rpcRequest('getEpochInfo', []),
        rpcRequest('getSupply', [{ excludeNonCirculatingAccountsList: true }]),
        rpcRequest('getRecentPerformanceSamples', [1]),
      ]);

      const perf = perfResult.data?.[0] || {};
      const tps = perf.numTransactions && perf.samplePeriodSecs 
        ? Math.round(perf.numTransactions / perf.samplePeriodSecs)
        : null;

      return {
        slot: slotResult.data,
        epoch: epochResult.data?.epoch,
        epoch_progress: epochResult.data?.slotIndex && epochResult.data?.slotsInEpoch
          ? ((epochResult.data.slotIndex / epochResult.data.slotsInEpoch) * 100).toFixed(2) + '%'
          : null,
        total_supply: supplyResult.data?.value?.total / LAMPORTS_PER_SOL,
        circulating_supply: supplyResult.data?.value?.circulating / LAMPORTS_PER_SOL,
        tps,
        block_height: epochResult.data?.blockHeight,
      };
    } catch (error) {
      logger.error('getNetworkStats error:', error.message);
      throw error;
    }
  });
}

/**
 * Get recent priority fees
 */
async function getPriorityFees() {
  const cacheKey = 'solana:priorityFees';
  
  return getOrSet(cacheKey, 10, async () => {
    try {
      const result = await rpcRequest('getRecentPrioritizationFees', [[]]);
      
      const fees = result.data || [];
      const recentFees = fees.slice(-20);
      
      if (recentFees.length === 0) {
        return { low: 0, medium: 0, high: 0 };
      }

      const sortedFees = recentFees
        .map(f => f.prioritizationFee)
        .sort((a, b) => a - b);

      return {
        low: sortedFees[0] || 0,
        medium: sortedFees[Math.floor(sortedFees.length / 2)] || 0,
        high: sortedFees[sortedFees.length - 1] || 0,
        samples: recentFees.length,
      };
    } catch (error) {
      logger.error('getPriorityFees error:', error.message);
      return { low: 0, medium: 1000, high: 10000 };
    }
  });
}

/**
 * Validate Solana address
 */
function isValidAddress(address) {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get signature statuses (for multiple signatures)
 */
async function getSignatureStatuses(signatures) {
  const result = await rpcRequest('getSignatureStatuses', [signatures, { searchTransactionHistory: true }]);
  return result.data?.value || [];
}

module.exports = {
  rpcRequest,
  getBalance,
  getAccountInfo,
  getTransaction,
  sendTransaction,
  getSlot,
  getBlock,
  getTokenAccounts,
  getProviderStatus,
  // New methods
  getNFTs,
  getTransactionHistory,
  getTokenMetadata,
  getTokenPrice,
  getTokenPrices,
  getTokenHolders,
  getNetworkStats,
  getPriorityFees,
  isValidAddress,
  getSignatureStatuses,
};

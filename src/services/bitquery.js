/**
 * Bitquery Service
 * GraphQL API for Solana balance updates and blockchain data
 * 
 * Documentation: https://docs.bitquery.io/
 */

const axios = require('axios');
const { getOrSet } = require('../utils/cache');
const logger = require('../utils/logger');

// Bitquery API configuration
const BITQUERY_API_URL = 'https://streaming.bitquery.io/graphql';
const BITQUERY_API_KEY = process.env.BITQUERY_API_KEY || '';

// Axios client for Bitquery
const bitqueryClient = axios.create({
  baseURL: BITQUERY_API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${BITQUERY_API_KEY}`,
  },
});

/**
 * Execute GraphQL query against Bitquery
 */
async function executeQuery(query, variables = {}) {
  try {
    const response = await bitqueryClient.post('', {
      query,
      variables,
    });

    if (response.data.errors) {
      logger.error('Bitquery GraphQL errors:', response.data.errors);
      throw new Error(response.data.errors[0]?.message || 'GraphQL Error');
    }

    return response.data.data;
  } catch (error) {
    logger.error('Bitquery API error:', error.message);
    throw error;
  }
}

/**
 * Get recent balance updates (latest transactions with balance changes)
 */
async function getRecentBalanceUpdates(limit = 100) {
  const cacheKey = `bitquery:balanceUpdates:recent:${limit}`;
  
  return getOrSet(cacheKey, 30, async () => {
    const query = `
      query RecentBalanceUpdates($limit: Int!) {
        Solana {
          BalanceUpdates(limit: {count: $limit}) {
            Block {
              Time
              Height
              Slot
            }
            Transaction {
              FeePayer
              Signature
            }
            BalanceUpdate {
              Account {
                Address
                Owner
              }
              Amount
              AmountInUSD
              Currency {
                Name
                Symbol
                MintAddress
              }
              PostBalance
              PostBalanceInUSD
              PreBalance
              PreBalanceInUSD
            }
          }
        }
      }
    `;

    const data = await executeQuery(query, { limit });
    
    return (data?.Solana?.BalanceUpdates || []).map(update => ({
      block: {
        time: update.Block?.Time,
        height: update.Block?.Height,
        slot: update.Block?.Slot,
      },
      transaction: {
        fee_payer: update.Transaction?.FeePayer,
        signature: update.Transaction?.Signature,
      },
      balance_update: {
        account: {
          address: update.BalanceUpdate?.Account?.Address,
          owner: update.BalanceUpdate?.Account?.Owner,
        },
        amount: update.BalanceUpdate?.Amount,
        amount_usd: update.BalanceUpdate?.AmountInUSD,
        currency: {
          name: update.BalanceUpdate?.Currency?.Name,
          symbol: update.BalanceUpdate?.Currency?.Symbol,
          mint: update.BalanceUpdate?.Currency?.MintAddress,
        },
        post_balance: update.BalanceUpdate?.PostBalance,
        post_balance_usd: update.BalanceUpdate?.PostBalanceInUSD,
        pre_balance: update.BalanceUpdate?.PreBalance,
        pre_balance_usd: update.BalanceUpdate?.PreBalanceInUSD,
      },
    }));
  });
}

/**
 * Get native SOL and SPL token balances for an address
 */
async function getAddressBalances(ownerAddress) {
  const cacheKey = `bitquery:balances:${ownerAddress}`;
  
  return getOrSet(cacheKey, 60, async () => {
    const query = `
      query AddressBalances($owner: String!) {
        Solana {
          BalanceUpdates(
            where: {BalanceUpdate: {Account: {Owner: {is: $owner}}}}
            orderBy: {descendingByField: "BalanceUpdate_Balance_maximum"}
          ) {
            BalanceUpdate {
              Balance: PostBalance(maximum: Block_Slot)
              Currency {
                Name
                Symbol
                MintAddress
              }
              Account {
                Address
              }
            }
          }
        }
      }
    `;

    const data = await executeQuery(query, { owner: ownerAddress });
    
    const updates = data?.Solana?.BalanceUpdates || [];
    
    // Group by currency and get latest balance
    const balanceMap = new Map();
    
    for (const update of updates) {
      const mint = update.BalanceUpdate?.Currency?.MintAddress || 'SOL';
      const symbol = update.BalanceUpdate?.Currency?.Symbol || 'SOL';
      
      if (!balanceMap.has(mint)) {
        balanceMap.set(mint, {
          mint: mint === 'SOL' ? null : mint,
          symbol,
          name: update.BalanceUpdate?.Currency?.Name || symbol,
          balance: update.BalanceUpdate?.Balance || 0,
          account: update.BalanceUpdate?.Account?.Address,
        });
      }
    }
    
    return {
      owner: ownerAddress,
      balances: Array.from(balanceMap.values()),
      count: balanceMap.size,
    };
  });
}

/**
 * Get balance history for a specific account
 */
async function getBalanceHistory(accountAddress, limit = 50) {
  const cacheKey = `bitquery:balanceHistory:${accountAddress}:${limit}`;
  
  return getOrSet(cacheKey, 60, async () => {
    const query = `
      query BalanceHistory($account: String!, $limit: Int!) {
        Solana {
          BalanceUpdates(
            where: {BalanceUpdate: {Account: {Address: {is: $account}}}}
            limit: {count: $limit}
            orderBy: {descending: Block_Slot}
          ) {
            Block {
              Time
              Slot
            }
            Transaction {
              Signature
            }
            BalanceUpdate {
              Amount
              AmountInUSD
              PostBalance
              PreBalance
              Currency {
                Symbol
                MintAddress
              }
            }
          }
        }
      }
    `;

    const data = await executeQuery(query, { account: accountAddress, limit });
    
    return (data?.Solana?.BalanceUpdates || []).map(update => ({
      time: update.Block?.Time,
      slot: update.Block?.Slot,
      signature: update.Transaction?.Signature,
      amount: update.BalanceUpdate?.Amount,
      amount_usd: update.BalanceUpdate?.AmountInUSD,
      post_balance: update.BalanceUpdate?.PostBalance,
      pre_balance: update.BalanceUpdate?.PreBalance,
      currency: {
        symbol: update.BalanceUpdate?.Currency?.Symbol,
        mint: update.BalanceUpdate?.Currency?.MintAddress,
      },
    }));
  });
}

/**
 * Get token transfers for an address
 */
async function getTokenTransfers(address, options = {}) {
  const { limit = 50, mint } = options;
  const cacheKey = `bitquery:transfers:${address}:${limit}:${mint || 'all'}`;
  
  return getOrSet(cacheKey, 30, async () => {
    const whereClause = mint 
      ? `where: {BalanceUpdate: {Account: {Owner: {is: "${address}"}}, Currency: {MintAddress: {is: "${mint}"}}}}`
      : `where: {BalanceUpdate: {Account: {Owner: {is: "${address}"}}}}`;

    const query = `
      query TokenTransfers {
        Solana {
          BalanceUpdates(
            ${whereClause}
            limit: {count: ${limit}}
            orderBy: {descending: Block_Slot}
          ) {
            Block {
              Time
              Slot
            }
            Transaction {
              Signature
              FeePayer
            }
            BalanceUpdate {
              Account {
                Address
              }
              Amount
              AmountInUSD
              PostBalance
              PreBalance
              Currency {
                Name
                Symbol
                MintAddress
              }
            }
          }
        }
      }
    `;

    const data = await executeQuery(query);
    
    return (data?.Solana?.BalanceUpdates || []).map(update => ({
      time: update.Block?.Time,
      slot: update.Block?.Slot,
      signature: update.Transaction?.Signature,
      fee_payer: update.Transaction?.FeePayer,
      account: update.BalanceUpdate?.Account?.Address,
      amount: update.BalanceUpdate?.Amount,
      amount_usd: update.BalanceUpdate?.AmountInUSD,
      post_balance: update.BalanceUpdate?.PostBalance,
      pre_balance: update.BalanceUpdate?.PreBalance,
      is_incoming: (update.BalanceUpdate?.Amount || 0) > 0,
      currency: {
        name: update.BalanceUpdate?.Currency?.Name,
        symbol: update.BalanceUpdate?.Currency?.Symbol,
        mint: update.BalanceUpdate?.Currency?.MintAddress,
      },
    }));
  });
}

/**
 * Get top token holders for a specific mint
 */
async function getTokenHolders(mintAddress, limit = 100) {
  const cacheKey = `bitquery:holders:${mintAddress}:${limit}`;
  
  return getOrSet(cacheKey, 300, async () => {
    const query = `
      query TokenHolders($mint: String!, $limit: Int!) {
        Solana {
          BalanceUpdates(
            where: {BalanceUpdate: {Currency: {MintAddress: {is: $mint}}}}
            orderBy: {descendingByField: "BalanceUpdate_Balance_maximum"}
            limit: {count: $limit}
          ) {
            BalanceUpdate {
              Account {
                Address
                Owner
              }
              Balance: PostBalance(maximum: Block_Slot)
            }
          }
        }
      }
    `;

    const data = await executeQuery(query, { mint: mintAddress, limit });
    
    // Dedupe by owner and get top balances
    const holderMap = new Map();
    
    for (const update of data?.Solana?.BalanceUpdates || []) {
      const owner = update.BalanceUpdate?.Account?.Owner;
      const balance = update.BalanceUpdate?.Balance || 0;
      
      if (owner && balance > 0) {
        if (!holderMap.has(owner) || holderMap.get(owner).balance < balance) {
          holderMap.set(owner, {
            owner,
            account: update.BalanceUpdate?.Account?.Address,
            balance,
          });
        }
      }
    }
    
    return {
      mint: mintAddress,
      holders: Array.from(holderMap.values())
        .sort((a, b) => b.balance - a.balance)
        .slice(0, limit)
        .map((h, i) => ({ rank: i + 1, ...h })),
      count: holderMap.size,
    };
  });
}

/**
 * Get historical transfers at a specific block height
 */
async function getHistoricalTransfers(blockHeight, limit = 10) {
  const cacheKey = `bitquery:historicalTransfers:${blockHeight}:${limit}`;
  
  return getOrSet(cacheKey, 300, async () => {
    const query = `
      query HistoricalTransfers($height: Int!, $limit: Int!) {
        solana(network: solana) {
          transfers(
            options: {limit: $limit, asc: ["block.height", "transaction.transactionIndex"]}
            height: {is: $height}
          ) {
            currency {
              tokenId
              symbol
              name
              address
            }
            instruction {
              program {
                name
                id
              }
              externalAction {
                type
                name
              }
            }
            sender {
              address
              type
              mintAccount
            }
            receiver {
              type
              mintAccount
              address
            }
            transaction {
              signature
              signer
              transactionIndex
            }
            block {
              height
            }
          }
        }
      }
    `;

    const data = await executeQuery(query, { height: blockHeight, limit });
    
    return (data?.solana?.transfers || []).map(transfer => ({
      currency: {
        token_id: transfer.currency?.tokenId,
        symbol: transfer.currency?.symbol,
        name: transfer.currency?.name,
        address: transfer.currency?.address,
      },
      instruction: {
        program: {
          name: transfer.instruction?.program?.name,
          id: transfer.instruction?.program?.id,
        },
        action: {
          type: transfer.instruction?.externalAction?.type,
          name: transfer.instruction?.externalAction?.name,
        },
      },
      sender: {
        address: transfer.sender?.address,
        type: transfer.sender?.type,
        mint_account: transfer.sender?.mintAccount,
      },
      receiver: {
        address: transfer.receiver?.address,
        type: transfer.receiver?.type,
        mint_account: transfer.receiver?.mintAccount,
      },
      transaction: {
        signature: transfer.transaction?.signature,
        signer: transfer.transaction?.signer,
        index: transfer.transaction?.transactionIndex,
      },
      block_height: transfer.block?.height,
    }));
  });
}

/**
 * Get latest trades for a specific token
 * Returns DEX trades with price and amount info
 */
async function getTokenTrades(mintAddress, options = {}) {
  const { limit = 50, quoteMints } = options;
  const cacheKey = `bitquery:tokenTrades:${mintAddress}:${limit}`;
  
  // Default quote currencies: SOL, USDC, USDT, JUP, WIF
  const defaultQuoteMints = [
    'So11111111111111111111111111111111111111112',  // SOL
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
    'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', // JUP
    'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', // WIF
  ];
  
  const quotes = quoteMints || defaultQuoteMints;
  
  return getOrSet(cacheKey, 15, async () => {
    const query = `
      query LatestTrades($mint: String!, $quoteMints: [String!], $limit: Int!) {
        Solana {
          DEXTradeByTokens(
            orderBy: {descending: Block_Time}
            limit: {count: $limit}
            where: {
              Trade: {
                Currency: {MintAddress: {is: $mint}}
                Side: {Currency: {MintAddress: {in: $quoteMints}}}
              }
            }
          ) {
            Block {
              Time
            }
            Transaction {
              Signature
            }
            Trade {
              Market {
                MarketAddress
              }
              Dex {
                ProtocolName
                ProtocolFamily
              }
              AmountInUSD
              PriceInUSD
              Amount
              Currency {
                Name
                Symbol
                MintAddress
              }
              Side {
                Type
                Currency {
                  Symbol
                  MintAddress
                  Name
                }
                AmountInUSD
                Amount
              }
            }
          }
        }
      }
    `;

    const data = await executeQuery(query, { 
      mint: mintAddress, 
      quoteMints: quotes,
      limit 
    });
    
    return (data?.Solana?.DEXTradeByTokens || []).map(trade => ({
      time: trade.Block?.Time,
      signature: trade.Transaction?.Signature,
      market: trade.Trade?.Market?.MarketAddress,
      dex: {
        protocol: trade.Trade?.Dex?.ProtocolName,
        family: trade.Trade?.Dex?.ProtocolFamily,
      },
      trade: {
        amount: trade.Trade?.Amount,
        amount_usd: trade.Trade?.AmountInUSD,
        price_usd: trade.Trade?.PriceInUSD,
        currency: {
          name: trade.Trade?.Currency?.Name,
          symbol: trade.Trade?.Currency?.Symbol,
          mint: trade.Trade?.Currency?.MintAddress,
        },
      },
      side: {
        type: trade.Trade?.Side?.Type,
        amount: trade.Trade?.Side?.Amount,
        amount_usd: trade.Trade?.Side?.AmountInUSD,
        currency: {
          name: trade.Trade?.Side?.Currency?.Name,
          symbol: trade.Trade?.Side?.Currency?.Symbol,
          mint: trade.Trade?.Side?.Currency?.MintAddress,
        },
      },
    }));
  });
}

/**
 * Get DEX trades filtered by protocol (e.g., pump.fun, raydium, orca)
 */
async function getDexTrades(options = {}) {
  const { protocol = 'pump', limit = 50 } = options;
  const cacheKey = `bitquery:dexTrades:${protocol}:${limit}`;
  
  return getOrSet(cacheKey, 10, async () => {
    const query = `
      query DexTrades($protocol: String!, $limit: Int!) {
        Solana {
          DEXTrades(
            limit: {count: $limit}
            orderBy: {descending: Block_Time}
            where: {
              Trade: {
                Dex: {
                  ProtocolName: {is: $protocol}
                }
              }
              Transaction: {Result: {Success: true}}
            }
          ) {
            Block {
              Time
              Slot
            }
            Instruction {
              Program {
                Method
              }
            }
            Trade {
              Dex {
                ProtocolFamily
                ProtocolName
              }
              Buy {
                Amount
                Account {
                  Address
                }
                Currency {
                  Name
                  Symbol
                  MintAddress
                  Decimals
                  Fungible
                  Uri
                }
              }
              Sell {
                Amount
                Account {
                  Address
                }
                Currency {
                  Name
                  Symbol
                  MintAddress
                  Decimals
                  Fungible
                  Uri
                }
              }
            }
            Transaction {
              Signature
            }
          }
        }
      }
    `;

    const data = await executeQuery(query, { protocol, limit });
    
    return (data?.Solana?.DEXTrades || []).map(trade => ({
      time: trade.Block?.Time,
      slot: trade.Block?.Slot,
      signature: trade.Transaction?.Signature,
      method: trade.Instruction?.Program?.Method,
      dex: {
        protocol: trade.Trade?.Dex?.ProtocolName,
        family: trade.Trade?.Dex?.ProtocolFamily,
      },
      buy: {
        amount: trade.Trade?.Buy?.Amount,
        account: trade.Trade?.Buy?.Account?.Address,
        currency: {
          name: trade.Trade?.Buy?.Currency?.Name,
          symbol: trade.Trade?.Buy?.Currency?.Symbol,
          mint: trade.Trade?.Buy?.Currency?.MintAddress,
          decimals: trade.Trade?.Buy?.Currency?.Decimals,
          fungible: trade.Trade?.Buy?.Currency?.Fungible,
          uri: trade.Trade?.Buy?.Currency?.Uri,
        },
      },
      sell: {
        amount: trade.Trade?.Sell?.Amount,
        account: trade.Trade?.Sell?.Account?.Address,
        currency: {
          name: trade.Trade?.Sell?.Currency?.Name,
          symbol: trade.Trade?.Sell?.Currency?.Symbol,
          mint: trade.Trade?.Sell?.Currency?.MintAddress,
          decimals: trade.Trade?.Sell?.Currency?.Decimals,
          fungible: trade.Trade?.Sell?.Currency?.Fungible,
          uri: trade.Trade?.Sell?.Currency?.Uri,
        },
      },
    }));
  });
}

/**
 * Get pump.fun specific trades (new token launches)
 */
async function getPumpFunTrades(limit = 50) {
  return getDexTrades({ protocol: 'pump', limit });
}

/**
 * Get Raydium DEX trades
 */
async function getRaydiumTrades(limit = 50) {
  return getDexTrades({ protocol: 'raydium', limit });
}

/**
 * Get Orca DEX trades
 */
async function getOrcaTrades(limit = 50) {
  return getDexTrades({ protocol: 'orca', limit });
}

/**
 * Get Jupiter aggregator trades
 */
async function getJupiterTrades(limit = 50) {
  return getDexTrades({ protocol: 'jupiter', limit });
}

/**
 * Get OHLCV (candlestick) data for a token
 */
async function getTokenOHLCV(mintAddress, options = {}) {
  const { interval = '1h', limit = 100 } = options;
  const cacheKey = `bitquery:ohlcv:${mintAddress}:${interval}:${limit}`;
  
  return getOrSet(cacheKey, 60, async () => {
    const query = `
      query TokenOHLCV($mint: String!, $limit: Int!) {
        Solana {
          DEXTradeByTokens(
            orderBy: {descending: Block_Time}
            limit: {count: $limit}
            where: {
              Trade: {
                Currency: {MintAddress: {is: $mint}}
                Side: {Currency: {MintAddress: {is: "So11111111111111111111111111111111111111112"}}}
              }
            }
          ) {
            Block {
              Time
            }
            Trade {
              PriceInUSD
              Amount
              AmountInUSD
              Side {
                Amount
              }
            }
          }
        }
      }
    `;

    const data = await executeQuery(query, { mint: mintAddress, limit });
    
    const trades = data?.Solana?.DEXTradeByTokens || [];
    
    // Return raw trades - client can aggregate into candles
    return trades.map(t => ({
      time: t.Block?.Time,
      price_usd: t.Trade?.PriceInUSD,
      amount: t.Trade?.Amount,
      amount_usd: t.Trade?.AmountInUSD,
      quote_amount: t.Trade?.Side?.Amount,
    }));
  });
}

/**
 * Check if Bitquery API is configured
 */
function isConfigured() {
  return !!BITQUERY_API_KEY;
}

module.exports = {
  executeQuery,
  getRecentBalanceUpdates,
  getAddressBalances,
  getBalanceHistory,
  getTokenTransfers,
  getTokenHolders,
  getHistoricalTransfers,
  getTokenTrades,
  getDexTrades,
  getPumpFunTrades,
  getRaydiumTrades,
  getOrcaTrades,
  getJupiterTrades,
  getTokenOHLCV,
  isConfigured,
};

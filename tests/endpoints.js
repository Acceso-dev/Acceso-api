/**
 * API Endpoints Documentation & Testing
 * 
 * This file documents all API endpoints for api.acceso.dev
 * Run with: node tests/endpoints.js
 */

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_KEY = process.env.TEST_API_KEY || 'acc_test_key_for_development';

// =============================================================================
// ENDPOINT DEFINITIONS
// =============================================================================

const ENDPOINTS = {
  // =========================================================================
  // HEALTH & STATUS (No Authentication Required)
  // =========================================================================
  health: {
    title: 'Health & Status Endpoints',
    endpoints: [
      {
        method: 'GET',
        path: '/',
        description: 'API information and available endpoints',
        auth: false,
        example: {
          response: {
            success: true,
            data: {
              name: 'api.acceso.dev',
              version: 'v1',
              endpoints: { health: '/health', solana: '/v1/solana', '...': '...' }
            }
          }
        }
      },
      {
        method: 'GET',
        path: '/health',
        description: 'Basic health check - returns 200 if server is running',
        auth: false,
        example: {
          response: {
            success: true,
            data: { status: 'healthy', uptime: 12345, version: '1.0.0' }
          }
        }
      },
      {
        method: 'GET',
        path: '/ready',
        description: 'Readiness probe - checks database and Redis connections',
        auth: false,
        example: {
          response: {
            success: true,
            data: {
              status: 'ready',
              checks: { database: true, redis: true }
            }
          }
        }
      },
      {
        method: 'GET',
        path: '/metrics',
        description: 'Prometheus metrics endpoint',
        auth: false,
        contentType: 'text/plain',
        example: {
          response: '# HELP process_cpu_user_seconds_total...'
        }
      },
    ]
  },

  // =========================================================================
  // SOLANA ENDPOINTS
  // =========================================================================
  solana: {
    title: 'Solana RPC Endpoints',
    baseUrl: '/v1/solana',
    endpoints: [
      {
        method: 'POST',
        path: '/v1/solana/rpc',
        description: 'JSON-RPC proxy to Solana nodes',
        auth: true,
        body: {
          jsonrpc: '2.0',
          id: 1,
          method: 'getBalance',
          params: ['So11111111111111111111111111111111111111112']
        },
        example: {
          response: {
            jsonrpc: '2.0',
            id: 1,
            result: { value: 1000000000 }
          }
        }
      },
      {
        method: 'GET',
        path: '/v1/solana/balance/:address',
        description: 'Get SOL balance for an address',
        auth: true,
        params: { address: 'Solana wallet address (base58)' },
        example: {
          request: '/v1/solana/balance/So11111111111111111111111111111111111111112',
          response: {
            success: true,
            data: { address: 'So11...', balance: 1.5, lamports: 1500000000 },
            meta: { cached: true }
          }
        }
      },
      {
        method: 'GET',
        path: '/v1/solana/account/:address',
        description: 'Get account info for an address',
        auth: true,
        params: { address: 'Solana wallet address (base58)' },
        example: {
          response: {
            success: true,
            data: { owner: '11111...', lamports: 1000000, executable: false }
          }
        }
      },
      {
        method: 'GET',
        path: '/v1/solana/transaction/:signature',
        description: 'Get transaction details by signature',
        auth: true,
        params: { signature: 'Transaction signature (base58)' },
        example: {
          response: {
            success: true,
            data: { slot: 123456, blockTime: 1702100000, meta: {} }
          }
        }
      },
      {
        method: 'POST',
        path: '/v1/solana/transaction/send',
        description: 'Send a signed transaction',
        auth: true,
        body: {
          transaction: 'base64 encoded signed transaction',
          options: { skipPreflight: false, maxRetries: 3 }
        },
        example: {
          response: {
            success: true,
            data: { signature: '5wHu1...', status: 'sent' }
          }
        }
      },
      {
        method: 'GET',
        path: '/v1/solana/slot',
        description: 'Get current slot',
        auth: true,
        example: {
          response: { success: true, data: { slot: 234567890 } }
        }
      },
      {
        method: 'GET',
        path: '/v1/solana/block/:slot',
        description: 'Get block by slot number',
        auth: true,
        params: { slot: 'Block slot number' },
        example: {
          response: {
            success: true,
            data: { blockhash: 'abc...', transactions: [] }
          }
        }
      },
      {
        method: 'GET',
        path: '/v1/solana/tokens/:address',
        description: 'Get token accounts for an address',
        auth: true,
        params: { address: 'Solana wallet address' },
        example: {
          response: {
            success: true,
            data: {
              address: 'So11...',
              tokens: [{ mint: 'EPjFW...', balance: 100.5, decimals: 6 }]
            }
          }
        }
      },
    ]
  },

  // =========================================================================
  // POLYMARKET ENDPOINTS
  // =========================================================================
  polymarket: {
    title: 'Polymarket Data Endpoints',
    baseUrl: '/v1/polymarket',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/polymarket/markets',
        description: 'List all markets with pagination and filters',
        auth: true,
        query: {
          page: 'Page number (default: 1)',
          limit: 'Items per page (default: 20, max: 100)',
          status: 'active | closed | all (default: active)',
          category: 'Filter by category slug',
          search: 'Search query',
          sort: 'volume | liquidity | created | end_date',
          order: 'asc | desc'
        },
        example: {
          request: '/v1/polymarket/markets?status=active&limit=10',
          response: {
            success: true,
            data: [{ id: '0x123...', question: 'Will X happen?', yes_price: 0.65 }],
            pagination: { page: 1, limit: 10, total: 500, has_next: true }
          }
        }
      },
      {
        method: 'GET',
        path: '/v1/polymarket/markets/:id',
        description: 'Get market details by ID',
        auth: true,
        params: { id: 'Market ID' },
        example: {
          response: {
            success: true,
            data: {
              id: '0x123...',
              question: 'Will X happen by 2025?',
              description: 'Full market description...',
              status: 'active',
              volume: 1000000,
              yes_price: 0.65,
              no_price: 0.35
            }
          }
        }
      },
      {
        method: 'GET',
        path: '/v1/polymarket/markets/:id/price',
        description: 'Get current price for a market',
        auth: true,
        params: { id: 'Market ID' },
        example: {
          response: {
            success: true,
            data: {
              market_id: '0x123...',
              price: 0.65,
              yes_price: 0.65,
              no_price: 0.35,
              volume_24h: 50000,
              liquidity: 200000
            }
          }
        }
      },
      {
        method: 'GET',
        path: '/v1/polymarket/markets/:id/price/history',
        description: 'Get price history (OHLCV candles)',
        auth: true,
        params: { id: 'Market ID' },
        query: {
          interval: '1m | 5m | 15m | 1h | 4h | 1d (default: 1h)',
          start: 'Start time (ISO 8601)',
          end: 'End time (ISO 8601)',
          limit: 'Max candles (default: 100, max: 1000)'
        },
        example: {
          response: {
            success: true,
            data: {
              market_id: '0x123...',
              interval: '1h',
              candles: [{ time: '2024-12-09T10:00:00Z', open: 0.60, high: 0.67, low: 0.59, close: 0.65, volume: 5000 }]
            }
          }
        }
      },
      {
        method: 'GET',
        path: '/v1/polymarket/markets/:id/orderbook',
        description: 'Get order book for a market',
        auth: true,
        params: { id: 'Market ID' },
        query: { depth: 'Order book depth (default: 10, max: 50)' },
        example: {
          response: {
            success: true,
            data: {
              market_id: '0x123...',
              bids: [{ price: 0.64, size: 1000 }],
              asks: [{ price: 0.66, size: 800 }],
              spread: 0.02
            }
          }
        }
      },
      {
        method: 'GET',
        path: '/v1/polymarket/categories',
        description: 'List market categories',
        auth: true,
        example: {
          response: {
            success: true,
            data: [{ id: 1, slug: 'politics', label: 'Politics', market_count: 150 }]
          }
        }
      },
      {
        method: 'GET',
        path: '/v1/polymarket/trending',
        description: 'Get trending markets by volume',
        auth: true,
        example: {
          response: {
            success: true,
            data: [{ id: '0x123...', question: 'Trending market?', volume: 500000 }]
          }
        }
      },
      // =====================================================================
      // DATA API ENDPOINTS
      // =====================================================================
      {
        method: 'GET',
        path: '/v1/polymarket/users/:address',
        description: 'Get user profile by wallet address',
        auth: true,
        params: { address: 'Wallet address (0x...)' },
        example: {
          response: {
            success: true,
            data: { address: '0x123...', username: 'trader1', totalPositions: 15 }
          }
        }
      },
      {
        method: 'GET',
        path: '/v1/polymarket/users/:address/positions',
        description: 'Get user current positions/holdings',
        auth: true,
        params: { address: 'Wallet address' },
        query: { limit: 'Max results (default: 100)', offset: 'Skip N results' },
        example: {
          response: {
            success: true,
            data: [{ market: '0x123...', outcome: 'Yes', amount: 1000, avgPrice: 0.55 }]
          }
        }
      },
      {
        method: 'GET',
        path: '/v1/polymarket/users/:address/trades',
        description: 'Get user trade history',
        auth: true,
        params: { address: 'Wallet address' },
        query: { limit: 'Max results', offset: 'Skip N results', market: 'Filter by market ID' },
        example: {
          response: {
            success: true,
            data: [{ market: '0x123...', side: 'buy', price: 0.55, amount: 100 }]
          }
        }
      },
      {
        method: 'GET',
        path: '/v1/polymarket/users/:address/pnl',
        description: 'Get user profit and loss statistics',
        auth: true,
        params: { address: 'Wallet address' },
        example: {
          response: {
            success: true,
            data: { totalPnL: 5000, realizedPnL: 3500, unrealizedPnL: 1500 }
          }
        }
      },
      {
        method: 'GET',
        path: '/v1/polymarket/users/:address/activity',
        description: 'Get user activity feed',
        auth: true,
        params: { address: 'Wallet address' },
        query: { limit: 'Max results (default: 50)', offset: 'Skip N results' },
        example: {
          response: {
            success: true,
            data: [{ type: 'trade', timestamp: '2024-12-09T12:00:00Z', details: {} }]
          }
        }
      },
      {
        method: 'GET',
        path: '/v1/polymarket/leaderboard',
        description: 'Get global leaderboard',
        auth: true,
        query: {
          limit: 'Max results (default: 100)',
          offset: 'Skip N results',
          timeframe: 'day | week | month | all (default: all)'
        },
        example: {
          response: {
            success: true,
            data: [{ rank: 1, address: '0x123...', pnl: 100000 }]
          }
        }
      },
      {
        method: 'GET',
        path: '/v1/polymarket/events',
        description: 'Get events (grouped markets)',
        auth: true,
        query: { limit: 'Max results', offset: 'Skip N results', active: 'true/false' },
        example: {
          response: {
            success: true,
            data: [{ id: '123', title: 'Election 2024', marketCount: 10 }]
          }
        }
      },
      {
        method: 'GET',
        path: '/v1/polymarket/events/:id',
        description: 'Get event details',
        auth: true,
        params: { id: 'Event ID' },
        example: {
          response: {
            success: true,
            data: { id: '123', title: 'Election 2024', markets: [] }
          }
        }
      },
      {
        method: 'GET',
        path: '/v1/polymarket/search',
        description: 'Search markets by query',
        auth: true,
        query: {
          q: 'Search query (required, 2-100 chars)',
          limit: 'Max results (default: 20)',
          offset: 'Skip N results'
        },
        example: {
          response: {
            success: true,
            data: [{ id: '0x123...', question: 'Will Bitcoin...', relevance: 0.95 }]
          }
        }
      },
      // =====================================================================
      // WEBSOCKET MANAGEMENT ENDPOINTS
      // =====================================================================
      {
        method: 'GET',
        path: '/v1/polymarket/ws/status',
        description: 'Get WebSocket connection status',
        auth: true,
        example: {
          response: {
            success: true,
            data: {
              rtds: { connected: true, readyState: 1 },
              clobMarket: { connected: false },
              subscriptions: { cryptoPrices: ['update'], assetIds: [] }
            }
          }
        }
      },
      {
        method: 'POST',
        path: '/v1/polymarket/ws/connect',
        description: 'Connect to Polymarket RTDS WebSocket',
        auth: true,
        example: {
          response: {
            success: true,
            data: { message: 'WebSocket connections initiated', status: {} }
          }
        }
      },
      {
        method: 'POST',
        path: '/v1/polymarket/ws/disconnect',
        description: 'Disconnect from Polymarket WebSockets',
        auth: true,
        example: {
          response: { success: true, data: { message: 'WebSocket connections closed' } }
        }
      },
      {
        method: 'POST',
        path: '/v1/polymarket/ws/subscribe/crypto-prices',
        description: 'Subscribe to real-time crypto price updates via RTDS',
        auth: true,
        example: {
          response: {
            success: true,
            data: { message: 'Subscribed to crypto prices', status: {} }
          }
        }
      },
      {
        method: 'POST',
        path: '/v1/polymarket/ws/subscribe/comments',
        description: 'Subscribe to comments updates via RTDS',
        auth: true,
        body: { marketId: 'Optional market ID to filter comments' },
        example: {
          response: {
            success: true,
            data: { message: 'Subscribed to comments', status: {} }
          }
        }
      },
      {
        method: 'POST',
        path: '/v1/polymarket/ws/subscribe/market',
        description: 'Subscribe to market orderbook via CLOB',
        auth: true,
        body: { assetIds: 'Asset ID(s) to subscribe to (string or array)' },
        example: {
          request: { assetIds: ['109681959945973300464568698402968596289258214226684818748321941747028805721376'] },
          response: {
            success: true,
            data: { message: 'Subscribed to market orderbook', assetIds: ['...'], status: {} }
          }
        }
      },
      {
        method: 'POST',
        path: '/v1/polymarket/ws/unsubscribe',
        description: 'Unsubscribe from a topic via RTDS',
        auth: true,
        body: { topic: 'Topic name (e.g., crypto_prices)', type: 'Message type (e.g., update)' },
        example: {
          response: {
            success: true,
            data: { message: 'Unsubscribed from topic', topic: 'crypto_prices', type: 'update' }
          }
        }
      },
    ]
  },

  // =========================================================================
  // WORKFLOW ENDPOINTS
  // =========================================================================
  workflows: {
    title: 'Workflow Engine x402 Endpoints',
    baseUrl: '/v1/workflows',
    endpoints: [
      {
        method: 'POST',
        path: '/v1/workflows',
        description: 'Create a new workflow',
        auth: true,
        body: {
          name: 'My Workflow',
          description: 'Optional description',
          trigger: {
            type: 'price_threshold',
            config: { market_id: '0x123...', threshold: 0.90, direction: 'above' }
          },
          conditions: [{ type: 'time', operator: 'between', value: { start: '09:00', end: '17:00' } }],
          actions: [
            { type: 'webhook', config: { url: 'https://example.com/hook' } },
            { type: 'email', config: { to: 'user@example.com', subject: 'Alert!' } }
          ]
        },
        example: {
          response: {
            success: true,
            data: { id: 'uuid', name: 'My Workflow', is_active: false }
          }
        }
      },
      {
        method: 'GET',
        path: '/v1/workflows',
        description: 'List workflows for authenticated user',
        auth: true,
        query: {
          page: 'Page number',
          limit: 'Items per page',
          is_active: 'Filter by active status (true/false)'
        },
        example: {
          response: {
            success: true,
            data: [{ id: 'uuid', name: 'My Workflow', is_active: true }],
            pagination: { page: 1, limit: 20, total: 5 }
          }
        }
      },
      {
        method: 'GET',
        path: '/v1/workflows/:id',
        description: 'Get workflow details',
        auth: true,
        params: { id: 'Workflow UUID' },
        example: {
          response: {
            success: true,
            data: {
              id: 'uuid',
              name: 'My Workflow',
              trigger: { type: 'price_threshold', config: {} },
              conditions: [],
              actions: [{ type: 'webhook', config: {} }],
              is_active: true,
              execution_count: 42
            }
          }
        }
      },
      {
        method: 'PUT',
        path: '/v1/workflows/:id',
        description: 'Update a workflow',
        auth: true,
        params: { id: 'Workflow UUID' },
        body: {
          name: 'Updated Name',
          actions: [{ type: 'email', config: { to: 'new@email.com' } }]
        },
        example: {
          response: { success: true, data: { id: 'uuid', name: 'Updated Name' } }
        }
      },
      {
        method: 'DELETE',
        path: '/v1/workflows/:id',
        description: 'Delete a workflow',
        auth: true,
        params: { id: 'Workflow UUID' },
        example: { response: { status: 204 } }
      },
      {
        method: 'POST',
        path: '/v1/workflows/:id/execute',
        description: 'Execute a workflow manually',
        auth: true,
        params: { id: 'Workflow UUID' },
        body: { trigger_data: { custom: 'data' } },
        example: {
          response: {
            success: true,
            data: { execution_id: 'uuid', status: 'running', started_at: '...' }
          }
        }
      },
      {
        method: 'POST',
        path: '/v1/workflows/:id/enable',
        description: 'Enable a workflow',
        auth: true,
        params: { id: 'Workflow UUID' },
        example: {
          response: { success: true, data: { id: 'uuid', is_active: true } }
        }
      },
      {
        method: 'POST',
        path: '/v1/workflows/:id/disable',
        description: 'Disable a workflow',
        auth: true,
        params: { id: 'Workflow UUID' },
        example: {
          response: { success: true, data: { id: 'uuid', is_active: false } }
        }
      },
      {
        method: 'GET',
        path: '/v1/workflows/:id/history',
        description: 'Get workflow execution history',
        auth: true,
        params: { id: 'Workflow UUID' },
        query: { page: 'Page number', limit: 'Items per page' },
        example: {
          response: {
            success: true,
            data: [{ id: 'uuid', status: 'success', duration_ms: 1234 }],
            pagination: { page: 1, total: 100 }
          }
        }
      },
    ]
  },

  // =========================================================================
  // ZK PROOF ENDPOINTS
  // =========================================================================
  zk: {
    title: 'Zero-Knowledge Proof Endpoints',
    baseUrl: '/v1/zk',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/zk/circuits',
        description: 'List available ZK circuits',
        auth: true,
        example: {
          response: {
            success: true,
            data: {
              circuits: [
                {
                  id: 'identity',
                  name: 'Identity Proof',
                  description: 'Prove ownership without revealing identity',
                  input_schema: { secret: 'string', nullifier: 'string' },
                  proving_time_estimate: '5-10 seconds'
                }
              ]
            }
          }
        }
      },
      {
        method: 'POST',
        path: '/v1/zk/proofs/generate',
        description: 'Generate a proof (async, queued)',
        auth: true,
        rateLimit: 'Strict (10/min)',
        body: {
          circuit_id: 'identity',
          inputs: { secret: '0x123...', nullifier: '0x456...' },
          callback_url: 'https://example.com/proof-ready'
        },
        example: {
          response: {
            success: true,
            data: {
              proof_id: 'uuid',
              status: 'pending',
              estimated_time: '5-10 seconds',
              message: 'Check status at /v1/zk/proofs/:id'
            }
          }
        }
      },
      {
        method: 'GET',
        path: '/v1/zk/proofs/:id',
        description: 'Get proof status and result',
        auth: true,
        params: { id: 'Proof UUID' },
        example: {
          response: {
            success: true,
            data: {
              id: 'uuid',
              circuit_id: 'identity',
              status: 'completed',
              proof: { pi_a: [], pi_b: [], pi_c: [] },
              public_signals: ['0x...'],
              duration_ms: 5432
            }
          }
        }
      },
      {
        method: 'POST',
        path: '/v1/zk/proofs/verify',
        description: 'Verify a proof',
        auth: true,
        body: {
          circuit_id: 'identity',
          proof: { pi_a: [], pi_b: [], pi_c: [] },
          public_signals: ['0x...']
        },
        example: {
          response: {
            success: true,
            data: { valid: true, circuit_id: 'identity', verified_at: '...' }
          }
        }
      },
      {
        method: 'GET',
        path: '/v1/zk/proofs',
        description: 'List user proofs',
        auth: true,
        query: { page: '...', limit: '...', status: 'pending | processing | completed | failed' },
        example: {
          response: {
            success: true,
            data: [{ id: 'uuid', circuit_id: 'identity', status: 'completed' }]
          }
        }
      },
      {
        method: 'GET',
        path: '/v1/zk/stats',
        description: 'Get user ZK proof statistics',
        auth: true,
        example: {
          response: {
            success: true,
            data: { total: 50, completed: 48, failed: 2, avg_duration: 6000 }
          }
        }
      },
    ]
  },

  // =========================================================================
  // WEBHOOK ENDPOINTS
  // =========================================================================
  webhooks: {
    title: 'Webhook Management Endpoints',
    baseUrl: '/v1/webhooks',
    endpoints: [
      {
        method: 'POST',
        path: '/v1/webhooks',
        description: 'Create a new webhook',
        auth: true,
        body: {
          name: 'My Webhook',
          url: 'https://example.com/webhook',
          events: ['transaction.confirmed', 'workflow.completed']
        },
        example: {
          response: {
            success: true,
            data: {
              id: 'uuid',
              name: 'My Webhook',
              url: 'https://example.com/webhook',
              events: ['transaction.confirmed'],
              secret: 'whsec_xxxxx', // Only returned once!
              is_active: true
            }
          }
        }
      },
      {
        method: 'GET',
        path: '/v1/webhooks',
        description: 'List webhooks for authenticated user',
        auth: true,
        query: { page: '...', limit: '...' },
        example: {
          response: {
            success: true,
            data: [{ id: 'uuid', name: 'My Webhook', is_active: true }]
          }
        }
      },
      {
        method: 'GET',
        path: '/v1/webhooks/:id',
        description: 'Get webhook details',
        auth: true,
        params: { id: 'Webhook UUID' },
        example: {
          response: {
            success: true,
            data: { id: 'uuid', name: 'My Webhook', events: [], last_triggered_at: '...' }
          }
        }
      },
      {
        method: 'PUT',
        path: '/v1/webhooks/:id',
        description: 'Update a webhook',
        auth: true,
        params: { id: 'Webhook UUID' },
        body: { name: 'New Name', is_active: false },
        example: {
          response: { success: true, data: { id: 'uuid', name: 'New Name' } }
        }
      },
      {
        method: 'DELETE',
        path: '/v1/webhooks/:id',
        description: 'Delete a webhook',
        auth: true,
        params: { id: 'Webhook UUID' },
        example: { response: { status: 204 } }
      },
      {
        method: 'POST',
        path: '/v1/webhooks/:id/test',
        description: 'Test a webhook by sending a test payload',
        auth: true,
        params: { id: 'Webhook UUID' },
        body: { payload: { custom: 'test data' } },
        example: {
          response: {
            success: true,
            data: {
              webhook_id: 'uuid',
              success: true,
              status_code: 200,
              response_time_ms: 150
            }
          }
        }
      },
      {
        method: 'GET',
        path: '/v1/webhooks/:id/deliveries',
        description: 'Get webhook delivery logs',
        auth: true,
        params: { id: 'Webhook UUID' },
        query: { page: '...', limit: '...' },
        example: {
          response: {
            success: true,
            data: [{ id: 'uuid', event: 'transaction.confirmed', status: 'success', response_code: 200 }]
          }
        }
      },
      {
        method: 'POST',
        path: '/v1/webhooks/:id/rotate-secret',
        description: 'Rotate webhook secret',
        auth: true,
        params: { id: 'Webhook UUID' },
        example: {
          response: {
            success: true,
            data: { id: 'uuid', secret: 'whsec_new_xxxxx' }
          }
        }
      },
      {
        method: 'GET',
        path: '/v1/webhooks/:id/stats',
        description: 'Get webhook delivery statistics',
        auth: true,
        params: { id: 'Webhook UUID' },
        example: {
          response: {
            success: true,
            data: { total: 100, successful: 95, failed: 5, avg_duration: 200 }
          }
        }
      },
    ]
  },

  // =========================================================================
  // WEBSOCKET CHANNELS
  // =========================================================================
  websocket: {
    title: 'WebSocket Channels',
    connectionUrl: 'wss://api.acceso.dev/ws?api_key=YOUR_API_KEY',
    channels: [
      {
        channel: 'prices',
        description: 'Real-time Polymarket price updates',
        tier: 'free',
        example: {
          message: { type: 'message', channel: 'prices', data: { market_id: '0x123...', price: 0.67 } }
        }
      },
      {
        channel: 'markets',
        description: 'Market status updates',
        tier: 'free'
      },
      {
        channel: 'accounts/:address',
        description: 'Solana account change notifications',
        tier: 'basic'
      },
      {
        channel: 'transactions/:address',
        description: 'Transaction notifications for an address',
        tier: 'pro'
      },
      {
        channel: 'workflows/:id',
        description: 'Workflow execution events',
        tier: 'pro'
      },
    ],
    messages: {
      subscribe: { type: 'subscribe', channels: ['prices', 'markets'] },
      unsubscribe: { type: 'unsubscribe', channels: ['prices'] },
      ping: { type: 'ping' }
    }
  }
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function printEndpoints() {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 api.acceso.dev - API Endpoints Documentation');
  console.log('='.repeat(80) + '\n');

  for (const [category, section] of Object.entries(ENDPOINTS)) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`📌 ${section.title}`);
    if (section.baseUrl) console.log(`   Base URL: ${section.baseUrl}`);
    console.log('─'.repeat(80));

    if (section.endpoints) {
      for (const endpoint of section.endpoints) {
        const authBadge = endpoint.auth ? '🔐' : '🌐';
        console.log(`\n${authBadge} ${endpoint.method.padEnd(6)} ${endpoint.path}`);
        console.log(`   ${endpoint.description}`);
        
        if (endpoint.params) {
          console.log('   Params:', JSON.stringify(endpoint.params));
        }
        if (endpoint.query) {
          console.log('   Query:', Object.keys(endpoint.query).join(', '));
        }
        if (endpoint.body) {
          console.log('   Body:', JSON.stringify(endpoint.body).substring(0, 60) + '...');
        }
      }
    }

    if (section.channels) {
      for (const channel of section.channels) {
        console.log(`\n📡 ${channel.channel}`);
        console.log(`   ${channel.description}`);
        console.log(`   Tier: ${channel.tier}`);
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('Total Endpoints:');
  let total = 0;
  for (const section of Object.values(ENDPOINTS)) {
    if (section.endpoints) {
      console.log(`  ${section.title}: ${section.endpoints.length}`);
      total += section.endpoints.length;
    }
  }
  console.log(`  Total: ${total}`);
  console.log('='.repeat(80) + '\n');
}

function exportAsOpenAPI() {
  const openapi = {
    openapi: '3.0.3',
    info: {
      title: 'api.acceso.dev',
      version: '1.0.0',
      description: 'Clean, Lightweight API Infrastructure'
    },
    servers: [
      { url: 'https://api.acceso.dev', description: 'Production' },
      { url: 'http://localhost:3000', description: 'Development' }
    ],
    paths: {},
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key'
        }
      }
    }
  };

  for (const section of Object.values(ENDPOINTS)) {
    if (!section.endpoints) continue;

    for (const endpoint of section.endpoints) {
      const path = endpoint.path.replace(/:(\w+)/g, '{$1}');
      
      if (!openapi.paths[path]) {
        openapi.paths[path] = {};
      }

      openapi.paths[path][endpoint.method.toLowerCase()] = {
        summary: endpoint.description,
        security: endpoint.auth ? [{ ApiKeyAuth: [] }] : [],
        responses: {
          200: { description: 'Success' }
        }
      };
    }
  }

  return openapi;
}

// =============================================================================
// RUN TESTS
// =============================================================================

async function runTests() {
  const axios = require('axios');

  console.log('\n🧪 Running Endpoint Tests...\n');

  // Test health endpoint
  try {
    const response = await axios.get(`${API_BASE_URL}/health`);
    console.log('✅ GET /health - Status:', response.status);
  } catch (error) {
    console.log('❌ GET /health - Error:', error.message);
  }

  // Test ready endpoint
  try {
    const response = await axios.get(`${API_BASE_URL}/ready`);
    console.log('✅ GET /ready - Status:', response.status);
  } catch (error) {
    console.log('❌ GET /ready - Error:', error.message);
  }

  console.log('\n📋 Full test suite requires API key and running server.');
}

// =============================================================================
// MAIN
// =============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--test')) {
    runTests();
  } else if (args.includes('--openapi')) {
    console.log(JSON.stringify(exportAsOpenAPI(), null, 2));
  } else {
    printEndpoints();
  }
}

module.exports = { ENDPOINTS, printEndpoints, exportAsOpenAPI, runTests };

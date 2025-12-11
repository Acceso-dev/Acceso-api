/**
 * Polymarket WebSocket Service
 * Real-time updates from Polymarket prediction markets
 * 
 * Endpoints:
 * - wss://ws-live-data.polymarket.com - RTDS (Real-Time Data Socket)
 * - wss://ws-subscriptions-clob.polymarket.com/ws/market - CLOB Market Channel
 */

const WebSocket = require('ws');
const EventEmitter = require('events');
const logger = require('../utils/logger');
const { publisher } = require('../config/redis');

class PolymarketWebSocketService extends EventEmitter {
  constructor() {
    super();
    
    // WebSocket endpoints
    this.endpoints = {
      rtds: 'wss://ws-live-data.polymarket.com',
      clobMarket: 'wss://ws-subscriptions-clob.polymarket.com/ws/market',
    };
    
    // Connection states
    this.connections = {
      rtds: null,
      clobMarket: null,
    };
    
    // Subscription tracking
    this.subscriptions = {
      cryptoPrices: new Set(),
      comments: new Set(),
      markets: new Set(),
      assetIds: new Set(),
    };
    
    // Reconnection settings
    this.reconnectInterval = 5000;
    this.maxReconnectAttempts = 5;
    this.reconnectAttempts = {
      rtds: 0,
      clobMarket: 0,
    };
    
    // Heartbeat/Ping interval (5 seconds as per docs)
    this.pingInterval = 5000;
    this.pingTimers = {};
  }

  /**
   * Connect to RTDS (Real-Time Data Socket)
   * For crypto prices, comments, activity
   */
  async connectRTDS() {
    if (this.connections.rtds?.readyState === WebSocket.OPEN) {
      logger.info('Polymarket RTDS already connected');
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        logger.info('Connecting to Polymarket RTDS...');
        
        this.connections.rtds = new WebSocket(this.endpoints.rtds);

        this.connections.rtds.on('open', () => {
          logger.info('✅ Polymarket RTDS connected');
          this.reconnectAttempts.rtds = 0;
          this.startPing('rtds');
          this.emit('rtds:connected');
          resolve();
        });

        this.connections.rtds.on('message', (data) => {
          this.handleRTDSMessage(data);
        });

        this.connections.rtds.on('close', (code, reason) => {
          logger.warn(`Polymarket RTDS closed: ${code} - ${reason}`);
          this.stopPing('rtds');
          this.emit('rtds:disconnected');
          this.scheduleReconnect('rtds');
        });

        this.connections.rtds.on('error', (error) => {
          logger.error('Polymarket RTDS error:', error.message);
          this.emit('rtds:error', error);
          // Don't reject here, let the close handler deal with it
        });

        // Timeout for connection
        setTimeout(() => {
          if (this.connections.rtds?.readyState !== WebSocket.OPEN) {
            reject(new Error('RTDS connection timeout'));
          }
        }, 10000);

      } catch (error) {
        logger.error('Failed to connect to RTDS:', error.message);
        reject(error);
      }
    });
  }

  /**
   * Connect to CLOB Market Channel
   * For orderbook and trade updates (requires asset IDs)
   */
  async connectCLOBMarket(assetIds = []) {
    if (this.connections.clobMarket?.readyState === WebSocket.OPEN) {
      logger.info('Polymarket CLOB Market already connected');
      return;
    }

    if (!assetIds || assetIds.length === 0) {
      logger.warn('CLOB Market connection requires asset IDs');
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        logger.info('Connecting to Polymarket CLOB Market Channel...');
        
        this.connections.clobMarket = new WebSocket(this.endpoints.clobMarket);

        this.connections.clobMarket.on('open', () => {
          logger.info('✅ Polymarket CLOB Market connected');
          
          // Subscribe to market channel with asset IDs
          const subscribeMsg = {
            assets_ids: assetIds,
            type: 'market',
          };
          this.connections.clobMarket.send(JSON.stringify(subscribeMsg));
          
          // Store subscribed assets
          assetIds.forEach(id => this.subscriptions.assetIds.add(id));
          
          this.reconnectAttempts.clobMarket = 0;
          this.startPing('clobMarket');
          this.emit('clobMarket:connected');
          resolve();
        });

        this.connections.clobMarket.on('message', (data) => {
          this.handleCLOBMessage(data);
        });

        this.connections.clobMarket.on('close', (code, reason) => {
          logger.warn(`Polymarket CLOB Market closed: ${code} - ${reason}`);
          this.stopPing('clobMarket');
          this.emit('clobMarket:disconnected');
          // Don't auto-reconnect CLOB - requires asset IDs
        });

        this.connections.clobMarket.on('error', (error) => {
          logger.error('Polymarket CLOB Market error:', error.message);
          this.emit('clobMarket:error', error);
        });

        setTimeout(() => {
          if (this.connections.clobMarket?.readyState !== WebSocket.OPEN) {
            reject(new Error('CLOB Market connection timeout'));
          }
        }, 10000);

      } catch (error) {
        logger.error('Failed to connect to CLOB Market:', error.message);
        reject(error);
      }
    });
  }

  /**
   * Subscribe to RTDS topic
   */
  subscribeRTDS(topic, type, filters = null, auth = null) {
    if (this.connections.rtds?.readyState !== WebSocket.OPEN) {
      logger.warn('RTDS not connected, cannot subscribe');
      return false;
    }

    const subscription = {
      topic,
      type,
    };

    if (filters) {
      subscription.filters = filters;
    }

    if (auth?.clob) {
      subscription.clob_auth = auth.clob;
    }

    if (auth?.gamma) {
      subscription.gamma_auth = auth.gamma;
    }

    const message = {
      action: 'subscribe',
      subscriptions: [subscription],
    };

    this.connections.rtds.send(JSON.stringify(message));
    
    if (topic === 'crypto_prices') {
      this.subscriptions.cryptoPrices.add(type);
    } else if (topic === 'comments') {
      this.subscriptions.comments.add(filters || 'all');
    }

    logger.info(`Subscribed to RTDS: ${topic}/${type}`);
    return true;
  }

  /**
   * Unsubscribe from RTDS topic
   */
  unsubscribeRTDS(topic, type) {
    if (this.connections.rtds?.readyState !== WebSocket.OPEN) {
      return false;
    }

    const message = {
      action: 'unsubscribe',
      subscriptions: [{ topic, type }],
    };

    this.connections.rtds.send(JSON.stringify(message));
    
    if (topic === 'crypto_prices') {
      this.subscriptions.cryptoPrices.delete(type);
    }

    logger.info(`Unsubscribed from RTDS: ${topic}/${type}`);
    return true;
  }

  /**
   * Handle RTDS messages
   */
  handleRTDSMessage(rawData) {
    try {
      const dataStr = rawData.toString();
      
      // Handle PONG response
      if (dataStr === 'PONG') {
        return;
      }

      const data = JSON.parse(dataStr);
      
      if (data.type === 'pong') {
        return;
      }

      const { topic, type, timestamp, payload } = data;

      // Emit to local listeners
      this.emit('rtds:message', data);
      this.emit(`rtds:${topic}`, { type, timestamp, payload });
      this.emit(`rtds:${topic}:${type}`, { timestamp, payload });

      // Publish to Redis for distribution
      if (publisher) {
        publisher.publish(`polymarket:rtds:${topic}`, JSON.stringify(data));
      }

      logger.debug(`RTDS message: ${topic}/${type}`);
    } catch (error) {
      logger.error('Error parsing RTDS message:', error.message);
    }
  }

  /**
   * Handle CLOB Market messages
   */
  handleCLOBMessage(rawData) {
    try {
      const data = JSON.parse(rawData.toString());
      
      // Emit to local listeners
      this.emit('clobMarket:message', data);

      // Check message type
      if (data.event_type) {
        this.emit(`clobMarket:${data.event_type}`, data);
        
        // Handle specific events
        switch (data.event_type) {
          case 'book':
            this.emit('orderbook:update', {
              assetId: data.asset_id,
              bids: data.bids,
              asks: data.asks,
              timestamp: data.timestamp,
            });
            break;
          case 'trade':
            this.emit('trade:update', {
              assetId: data.asset_id,
              price: data.price,
              side: data.side,
              size: data.size,
              timestamp: data.timestamp,
            });
            break;
          case 'price_change':
            this.emit('price:update', {
              assetId: data.asset_id,
              price: data.price,
              oldPrice: data.old_price,
              timestamp: data.timestamp,
            });
            break;
        }
      }

      // Publish to Redis
      if (publisher) {
        publisher.publish('polymarket:clob:market', JSON.stringify(data));
      }

      logger.debug('CLOB Market message received');
    } catch (error) {
      logger.error('Error parsing CLOB message:', error.message);
    }
  }

  /**
   * Start ping timer for connection
   */
  startPing(connectionType) {
    this.stopPing(connectionType);
    
    this.pingTimers[connectionType] = setInterval(() => {
      const conn = this.connections[connectionType];
      if (conn?.readyState === WebSocket.OPEN) {
        conn.send('PING');
        logger.debug(`Ping sent: ${connectionType}`);
      }
    }, this.pingInterval);
  }

  /**
   * Stop ping timer
   */
  stopPing(connectionType) {
    if (this.pingTimers[connectionType]) {
      clearInterval(this.pingTimers[connectionType]);
      delete this.pingTimers[connectionType];
    }
  }

  /**
   * Schedule reconnection
   */
  scheduleReconnect(connectionType) {
    if (this.reconnectAttempts[connectionType] >= this.maxReconnectAttempts) {
      logger.error(`Max reconnect attempts reached for ${connectionType}`);
      return;
    }

    this.reconnectAttempts[connectionType]++;
    const delay = this.reconnectInterval * this.reconnectAttempts[connectionType];
    
    logger.info(`Scheduling reconnect for ${connectionType} in ${delay}ms (attempt ${this.reconnectAttempts[connectionType]})`);
    
    setTimeout(async () => {
      try {
        if (connectionType === 'rtds') {
          await this.connectRTDS();
          // Resubscribe to topics
          if (this.subscriptions.cryptoPrices.size > 0) {
            this.subscribeRTDS('crypto_prices', 'update');
          }
        }
        // Don't auto-reconnect CLOB - needs asset IDs
      } catch (error) {
        logger.error(`Reconnect failed for ${connectionType}:`, error.message);
      }
    }, delay);
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      rtds: {
        connected: this.connections.rtds?.readyState === WebSocket.OPEN,
        readyState: this.connections.rtds?.readyState,
        reconnectAttempts: this.reconnectAttempts.rtds,
      },
      clobMarket: {
        connected: this.connections.clobMarket?.readyState === WebSocket.OPEN,
        readyState: this.connections.clobMarket?.readyState,
        reconnectAttempts: this.reconnectAttempts.clobMarket,
      },
      subscriptions: {
        cryptoPrices: Array.from(this.subscriptions.cryptoPrices),
        comments: Array.from(this.subscriptions.comments),
        assetIds: Array.from(this.subscriptions.assetIds),
      },
    };
  }

  /**
   * Connect all WebSocket connections
   */
  async connectAll() {
    const results = {
      rtds: false,
      clobMarket: false,
    };

    try {
      await this.connectRTDS();
      results.rtds = true;
    } catch (error) {
      logger.warn('RTDS connection failed:', error.message);
    }

    // Note: CLOB requires asset IDs, so we don't connect it automatically

    return results;
  }

  /**
   * Disconnect all WebSocket connections
   */
  disconnectAll() {
    // Stop all ping timers
    Object.keys(this.pingTimers).forEach(key => this.stopPing(key));

    // Close RTDS
    if (this.connections.rtds) {
      this.connections.rtds.close();
      this.connections.rtds = null;
    }

    // Close CLOB Market
    if (this.connections.clobMarket) {
      this.connections.clobMarket.close();
      this.connections.clobMarket = null;
    }

    // Clear subscriptions
    this.subscriptions.cryptoPrices.clear();
    this.subscriptions.comments.clear();
    this.subscriptions.assetIds.clear();

    logger.info('All Polymarket WebSocket connections closed');
  }

  /**
   * Subscribe to crypto prices
   */
  async subscribeCryptoPrices() {
    if (this.connections.rtds?.readyState !== WebSocket.OPEN) {
      await this.connectRTDS();
    }
    
    return this.subscribeRTDS('crypto_prices', 'update');
  }

  /**
   * Subscribe to comments for a market
   */
  async subscribeComments(marketId = null) {
    if (this.connections.rtds?.readyState !== WebSocket.OPEN) {
      await this.connectRTDS();
    }
    
    return this.subscribeRTDS('comments', 'update', marketId);
  }

  /**
   * Subscribe to market orderbook via CLOB
   */
  async subscribeMarket(assetIds) {
    const ids = Array.isArray(assetIds) ? assetIds : [assetIds];
    
    if (this.connections.clobMarket?.readyState !== WebSocket.OPEN) {
      await this.connectCLOBMarket(ids);
    } else {
      // Already connected, add more asset IDs
      const subscribeMsg = {
        assets_ids: ids,
        type: 'market',
      };
      this.connections.clobMarket.send(JSON.stringify(subscribeMsg));
      ids.forEach(id => this.subscriptions.assetIds.add(id));
    }
    
    return true;
  }
}

// Singleton instance
const polymarketWS = new PolymarketWebSocketService();

module.exports = polymarketWS;

/**
 * WebSocket Service
 * Handles real-time connections
 */

const WebSocket = require('ws');
const { subscriber, publisher } = require('../config/redis');
const { ApiKey } = require('../models');
const logger = require('../utils/logger');
const config = require('../config/app');

// Connected clients
const clients = new Map();

// Channel subscriptions
const subscriptions = new Map();

/**
 * Initialize WebSocket server
 */
function initializeWebSocket(server) {
  const wss = new WebSocket.Server({
    server,
    path: '/ws',
    verifyClient: async ({ req }, callback) => {
      // Extract API key from query
      const url = new URL(req.url, `http://${req.headers.host}`);
      const apiKey = url.searchParams.get('api_key');

      if (!apiKey) {
        callback(false, 401, 'API key required');
        return;
      }

      // Validate API key
      const keyData = await ApiKey.validate(apiKey);
      if (!keyData || !keyData.is_active) {
        callback(false, 401, 'Invalid API key');
        return;
      }

      // Attach user data to request
      req.user = {
        id: keyData.user_id,
        apiKeyId: keyData.id,
        tier: keyData.tier,
      };

      callback(true);
    },
  });

  wss.on('connection', (ws, req) => {
    const clientId = generateClientId();
    
    // Store client
    clients.set(clientId, {
      ws,
      user: req.user,
      subscriptions: new Set(),
      lastPing: Date.now(),
    });

    logger.info('WebSocket client connected:', { clientId, userId: req.user.id });

    // Send welcome message
    sendToClient(clientId, {
      type: 'connected',
      client_id: clientId,
      timestamp: new Date().toISOString(),
    });

    // Handle messages
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data);
        await handleMessage(clientId, message);
      } catch (error) {
        sendToClient(clientId, {
          type: 'error',
          message: 'Invalid message format',
        });
      }
    });

    // Handle close
    ws.on('close', () => {
      const client = clients.get(clientId);
      if (client) {
        // Unsubscribe from all channels
        for (const channel of client.subscriptions) {
          unsubscribeFromChannel(clientId, channel);
        }
        clients.delete(clientId);
      }
      logger.info('WebSocket client disconnected:', { clientId });
    });

    // Handle errors
    ws.on('error', (error) => {
      logger.error('WebSocket error:', { clientId, error: error.message });
    });

    // Ping/pong for connection health
    ws.on('pong', () => {
      const client = clients.get(clientId);
      if (client) {
        client.lastPing = Date.now();
      }
    });
  });

  // Heartbeat interval
  const heartbeatInterval = setInterval(() => {
    const now = Date.now();
    
    for (const [clientId, client] of clients) {
      // Check for stale connections
      if (now - client.lastPing > config.wsHeartbeatInterval * 2) {
        logger.warn('Terminating stale WebSocket connection:', { clientId });
        client.ws.terminate();
        clients.delete(clientId);
        continue;
      }

      // Send ping
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.ping();
      }
    }
  }, config.wsHeartbeatInterval);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  // Subscribe to Redis pub/sub
  initializeRedisSubscriber();

  logger.info('WebSocket server initialized');

  return wss;
}

/**
 * Initialize Redis subscriber for broadcasting
 */
function initializeRedisSubscriber() {
  subscriber.on('message', (channel, message) => {
    try {
      const data = JSON.parse(message);
      broadcastToChannel(channel, data);
    } catch (error) {
      logger.error('Redis message parse error:', error.message);
    }
  });
}

/**
 * Handle incoming WebSocket message
 */
async function handleMessage(clientId, message) {
  const client = clients.get(clientId);
  if (!client) return;

  switch (message.type) {
    case 'subscribe':
      await handleSubscribe(clientId, message.channels || [message.channel]);
      break;

    case 'unsubscribe':
      await handleUnsubscribe(clientId, message.channels || [message.channel]);
      break;

    case 'ping':
      sendToClient(clientId, { type: 'pong', timestamp: Date.now() });
      break;

    default:
      sendToClient(clientId, {
        type: 'error',
        message: `Unknown message type: ${message.type}`,
      });
  }
}

/**
 * Handle subscribe request
 */
async function handleSubscribe(clientId, channels) {
  const client = clients.get(clientId);
  if (!client) return;

  const subscribedChannels = [];

  for (const channel of channels) {
    // Validate channel access based on tier
    if (!canAccessChannel(client.user.tier, channel)) {
      sendToClient(clientId, {
        type: 'error',
        message: `Access denied to channel: ${channel}`,
      });
      continue;
    }

    // Add to client subscriptions
    client.subscriptions.add(channel);

    // Add to channel subscribers
    if (!subscriptions.has(channel)) {
      subscriptions.set(channel, new Set());
      // Subscribe to Redis channel
      await subscriber.subscribe(channel);
    }
    subscriptions.get(channel).add(clientId);

    subscribedChannels.push(channel);
  }

  if (subscribedChannels.length > 0) {
    sendToClient(clientId, {
      type: 'subscribed',
      channels: subscribedChannels,
    });
  }
}

/**
 * Handle unsubscribe request
 */
async function handleUnsubscribe(clientId, channels) {
  const client = clients.get(clientId);
  if (!client) return;

  const unsubscribedChannels = [];

  for (const channel of channels) {
    unsubscribeFromChannel(clientId, channel);
    unsubscribedChannels.push(channel);
  }

  if (unsubscribedChannels.length > 0) {
    sendToClient(clientId, {
      type: 'unsubscribed',
      channels: unsubscribedChannels,
    });
  }
}

/**
 * Unsubscribe client from channel
 */
async function unsubscribeFromChannel(clientId, channel) {
  const client = clients.get(clientId);
  if (client) {
    client.subscriptions.delete(channel);
  }

  const channelSubs = subscriptions.get(channel);
  if (channelSubs) {
    channelSubs.delete(clientId);
    
    // If no more subscribers, unsubscribe from Redis
    if (channelSubs.size === 0) {
      subscriptions.delete(channel);
      await subscriber.unsubscribe(channel);
    }
  }
}

/**
 * Send message to specific client
 */
function sendToClient(clientId, data) {
  const client = clients.get(clientId);
  if (client && client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(data));
  }
}

/**
 * Broadcast to all subscribers of a channel
 */
function broadcastToChannel(channel, data) {
  const channelSubs = subscriptions.get(channel);
  if (!channelSubs) return;

  const message = JSON.stringify({
    type: 'message',
    channel,
    data,
    timestamp: new Date().toISOString(),
  });

  for (const clientId of channelSubs) {
    const client = clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  }
}

/**
 * Publish message to channel (via Redis)
 */
async function publish(channel, data) {
  await publisher.publish(channel, JSON.stringify(data));
}

/**
 * Check if tier can access channel
 */
function canAccessChannel(tier, channel) {
  // Channel access rules
  const tierAccess = {
    free: ['prices', 'markets'],
    basic: ['prices', 'markets', 'accounts'],
    pro: ['prices', 'markets', 'accounts', 'transactions', 'workflows'],
    enterprise: ['*'], // All channels
  };

  const allowed = tierAccess[tier] || tierAccess.free;
  
  if (allowed.includes('*')) return true;
  
  // Check if channel starts with allowed prefix
  return allowed.some((prefix) => channel.startsWith(prefix));
}

/**
 * Generate unique client ID
 */
function generateClientId() {
  return `ws_${Date.now().toString(36)}${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get connection stats
 */
function getStats() {
  return {
    connectedClients: clients.size,
    activeChannels: subscriptions.size,
    channels: Array.from(subscriptions.keys()).map((channel) => ({
      name: channel,
      subscribers: subscriptions.get(channel).size,
    })),
  };
}

module.exports = {
  initializeWebSocket,
  publish,
  broadcastToChannel,
  getStats,
};

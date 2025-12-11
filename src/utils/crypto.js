/**
 * Cryptographic Utilities
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../config/app');

/**
 * Generate a secure API key
 * Format: acceso_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 * Branded with "acceso" prefix for api.acceso.dev
 */
function generateApiKey(tier = 'free') {
  const prefix = 'acceso';
  const tierCode = tier === 'enterprise' ? 'ent' : tier === 'pro' ? 'pro' : 'free';
  const randomBytes = crypto.randomBytes(24).toString('hex');
  return `${prefix}_${tierCode}_${randomBytes}`;
}

/**
 * Hash an API key for storage
 */
async function hashApiKey(apiKey) {
  return bcrypt.hash(apiKey, config.bcryptRounds);
}

/**
 * Verify API key against hash
 */
async function verifyApiKey(apiKey, hash) {
  return bcrypt.compare(apiKey, hash);
}

/**
 * Generate a secure random token
 */
function generateToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Create HMAC signature for webhooks
 */
function createHmacSignature(payload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
}

/**
 * Verify HMAC signature
 */
function verifyHmacSignature(payload, signature, secret) {
  const expectedSignature = createHmacSignature(payload, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Hash password
 */
async function hashPassword(password) {
  return bcrypt.hash(password, config.bcryptRounds);
}

/**
 * Verify password
 */
async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Generate short ID (for request IDs, etc.)
 */
function generateShortId(length = 12) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const randomBytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[randomBytes[i] % chars.length];
  }
  return result;
}

/**
 * Mask API key for logging (show only first 8 chars)
 */
function maskApiKey(apiKey) {
  if (!apiKey || apiKey.length < 12) return '***';
  return `${apiKey.substring(0, 8)}...`;
}

module.exports = {
  generateApiKey,
  hashApiKey,
  verifyApiKey,
  generateToken,
  createHmacSignature,
  verifyHmacSignature,
  hashPassword,
  verifyPassword,
  generateShortId,
  maskApiKey,
};

/**
 * Winston Logger Configuration
 */

const winston = require('winston');
const config = require('../config/app');

const { format, transports } = winston;

// Custom format for structured logging
const customFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  format.metadata({ fillExcept: ['message', 'level', 'timestamp'] }),
  format.printf(({ level, message, timestamp, metadata }) => {
    const meta = Object.keys(metadata).length ? JSON.stringify(metadata) : '';
    return `${timestamp} [${level.toUpperCase()}]: ${message} ${meta}`;
  })
);

// JSON format for production
const jsonFormat = format.combine(
  format.timestamp(),
  format.errors({ stack: true }),
  format.json()
);

// Create logger instance
const logger = winston.createLogger({
  level: config.logLevel,
  format: config.env === 'production' ? jsonFormat : customFormat,
  defaultMeta: { service: 'api.acceso.dev' },
  transports: [
    // Console transport
    new transports.Console({
      format: config.env === 'production'
        ? jsonFormat
        : format.combine(format.colorize(), customFormat),
    }),
  ],
});

// Add file transports in production
if (config.env === 'production') {
  logger.add(new transports.File({
    filename: 'logs/error.log',
    level: 'error',
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }));
  logger.add(new transports.File({
    filename: 'logs/combined.log',
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }));
}

// Stream for Morgan
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

module.exports = logger;

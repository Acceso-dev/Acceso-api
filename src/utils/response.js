/**
 * Standard Response Helpers
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Generate request ID
 */
function generateRequestId() {
  return `req_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
}

/**
 * Success response
 */
function successResponse(res, data, meta = {}, statusCode = 200) {
  const requestId = res.req?.requestId || generateRequestId();
  
  return res.status(statusCode).json({
    success: true,
    data,
    meta: {
      request_id: requestId,
      timestamp: new Date().toISOString(),
      ...meta,
    },
  });
}

/**
 * Error response
 */
function errorResponse(res, code, message, statusCode = 400, details = null) {
  const requestId = res.req?.requestId || generateRequestId();
  
  const response = {
    success: false,
    error: {
      code,
      message,
      request_id: requestId,
      timestamp: new Date().toISOString(),
    },
  };

  if (details) {
    response.error.details = details;
  }

  return res.status(statusCode).json(response);
}

/**
 * Paginated response
 */
function paginatedResponse(res, data, pagination, meta = {}) {
  const requestId = res.req?.requestId || generateRequestId();
  
  return res.status(200).json({
    success: true,
    data,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total: pagination.total,
      total_pages: Math.ceil(pagination.total / pagination.limit),
      has_next: pagination.page < Math.ceil(pagination.total / pagination.limit),
      has_prev: pagination.page > 1,
    },
    meta: {
      request_id: requestId,
      timestamp: new Date().toISOString(),
      ...meta,
    },
  });
}

/**
 * Created response (201)
 */
function createdResponse(res, data, meta = {}) {
  return successResponse(res, data, meta, 201);
}

/**
 * No content response (204)
 */
function noContentResponse(res) {
  return res.status(204).send();
}

module.exports = {
  generateRequestId,
  successResponse,
  errorResponse,
  paginatedResponse,
  createdResponse,
  noContentResponse,
};

/**
 * ZK Proof Routes
 * Zero-Knowledge Proof API
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../../../middleware/errorHandler');
const { strictRateLimit } = require('../../../middleware/rateLimit');
const { validateBody, validateParams, validateQuery, Joi } = require('../../../middleware/validation');
const { successResponse, errorResponse, paginatedResponse, createdResponse } = require('../../../utils/response');
const ZkService = require('../../../services/zk');
const { prisma } = require('../../../lib/prisma');
const logger = require('../../../utils/logger');

// Validation schemas
const schemas = {
  proofId: Joi.object({
    id: Joi.string().uuid().required(),
  }),
  generateProof: Joi.object({
    circuit_id: Joi.string().required(),
    inputs: Joi.object().required(),
    callback_url: Joi.string().uri({ scheme: ['http', 'https'] }),
  }),
  verifyProof: Joi.object({
    circuit_id: Joi.string().required(),
    proof: Joi.object().required(),
    public_signals: Joi.array().items(Joi.string()).required(),
  }),
  listProofs: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    status: Joi.string().valid('pending', 'processing', 'completed', 'failed'),
  }),
};

/**
 * GET /v1/zk/circuits
 * List available circuits
 */
router.get(
  '/circuits',
  asyncHandler(async (req, res) => {
    const circuits = await ZkService.listCircuits();

    return successResponse(res, {
      circuits: circuits.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        input_schema: c.inputSchema,
        constraints: c.constraints,
        proving_time_estimate: c.provingTimeEstimate,
      })),
    });
  })
);

/**
 * POST /v1/zk/proofs/generate
 * Generate a proof (async queue)
 */
router.post(
  '/proofs/generate',
  strictRateLimit, // More restrictive rate limit for expensive operation
  validateBody(schemas.generateProof),
  asyncHandler(async (req, res) => {
    const { circuit_id, inputs, callback_url } = req.body;

    // Validate circuit exists
    const circuit = await ZkService.getCircuit(circuit_id);
    if (!circuit) {
      return errorResponse(res, 'INVALID_CIRCUIT', 'Circuit not found', 404);
    }

    // Create proof request
    const proof = await ZkProof.create({
      userId: req.user.id,
      circuitId: circuit_id,
      inputs,
    });

    // Queue proof generation
    await ZkService.queueProofGeneration(proof.id, {
      circuitId: circuit_id,
      inputs,
      callbackUrl: callback_url,
      userId: req.user.id,
    });

    return createdResponse(res, {
      proof_id: proof.id,
      status: 'pending',
      estimated_time: circuit.provingTimeEstimate,
      message: 'Proof generation queued. Check status at /v1/zk/proofs/:id',
    });
  })
);

/**
 * GET /v1/zk/proofs/:id
 * Get proof status and result
 */
router.get(
  '/proofs/:id',
  validateParams(schemas.proofId),
  asyncHandler(async (req, res) => {
    const proof = await ZkProof.findById(req.params.id, req.user.id);

    if (!proof) {
      return errorResponse(res, 'PROOF_NOT_FOUND', 'Proof not found', 404);
    }

    const response = {
      id: proof.id,
      circuit_id: proof.circuit_id,
      status: proof.status,
      created_at: proof.created_at,
    };

    if (proof.status === 'completed') {
      response.proof = proof.proof;
      response.public_signals = proof.public_signals;
      response.duration_ms = proof.duration_ms;
      response.completed_at = proof.completed_at;
    } else if (proof.status === 'failed') {
      response.error = proof.error;
      response.completed_at = proof.completed_at;
    }

    return successResponse(res, response);
  })
);

/**
 * POST /v1/zk/proofs/verify
 * Verify a proof
 */
router.post(
  '/proofs/verify',
  validateBody(schemas.verifyProof),
  asyncHandler(async (req, res) => {
    const { circuit_id, proof, public_signals } = req.body;

    // Validate circuit exists
    const circuit = await ZkService.getCircuit(circuit_id);
    if (!circuit) {
      return errorResponse(res, 'INVALID_CIRCUIT', 'Circuit not found', 404);
    }

    try {
      const isValid = await ZkService.verifyProof(circuit_id, proof, public_signals);

      return successResponse(res, {
        valid: isValid,
        circuit_id,
        verified_at: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Proof verification error:', error);
      return errorResponse(
        res,
        'PROOF_VERIFICATION_FAILED',
        'Failed to verify proof',
        400
      );
    }
  })
);

/**
 * GET /v1/zk/proofs
 * List user's proofs
 */
router.get(
  '/proofs',
  validateQuery(schemas.listProofs),
  asyncHandler(async (req, res) => {
    const { page, limit, status } = req.query;

    const result = await ZkProof.listByUser(req.user.id, { page, limit, status });

    return paginatedResponse(res, result.data, {
      page,
      limit,
      total: result.total,
    });
  })
);

/**
 * GET /v1/zk/stats
 * Get user's ZK proof stats
 */
router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const stats = await ZkProof.getStats(req.user.id);
    return successResponse(res, stats);
  })
);

// ============================================
// Direct Proof Generation Endpoints (Sync)
// ============================================

/**
 * POST /v1/zk/balance-proof
 * Generate a balance threshold proof
 * Proves: balance >= threshold without revealing actual balance
 */
router.post(
  '/balance-proof',
  strictRateLimit,
  validateBody(Joi.object({
    balance: Joi.alternatives().try(
      Joi.number().integer().min(0),
      Joi.string().pattern(/^\d+$/)
    ).required().description('Actual balance in smallest units (lamports/wei)'),
    threshold: Joi.alternatives().try(
      Joi.number().integer().min(0),
      Joi.string().pattern(/^\d+$/)
    ).required().description('Minimum balance to prove'),
  })),
  asyncHandler(async (req, res) => {
    const { balance, threshold } = req.body;

    try {
      const result = await ZkService.generateBalanceProof(balance, threshold);

      return successResponse(res, {
        success: true,
        circuit: 'balance_threshold',
        proof: result.proof,
        public_signals: result.publicSignals,
        threshold: result.threshold,
        message: 'Proof generated successfully. The proof demonstrates balance >= threshold without revealing actual balance.',
        verification_info: {
          circuit_id: 'balance',
          public_inputs: ['threshold', 'valid (1 = true)'],
          what_is_proven: `Balance is at least ${threshold} units`,
        },
      });
    } catch (error) {
      logger.error('Balance proof generation failed:', error);
      return errorResponse(
        res,
        'PROOF_GENERATION_FAILED',
        error.message,
        400
      );
    }
  })
);

/**
 * POST /v1/zk/holder-proof
 * Generate a token holder proof
 * Proves: user holds token (balance > 0) without revealing amount
 */
router.post(
  '/holder-proof',
  strictRateLimit,
  validateBody(Joi.object({
    balance: Joi.alternatives().try(
      Joi.number().integer().min(1),
      Joi.string().pattern(/^\d+$/)
    ).required().description('Token balance (must be > 0)'),
    token_address: Joi.string().required().description('Token mint address'),
    token_hash: Joi.string().required().description('Poseidon hash of token address'),
  })),
  asyncHandler(async (req, res) => {
    const { balance, token_address, token_hash } = req.body;

    try {
      const result = await ZkService.generateHolderProof(balance, token_address, token_hash);

      return successResponse(res, {
        success: true,
        circuit: 'token_holder',
        proof: result.proof,
        public_signals: result.publicSignals,
        token_hash: result.tokenHash,
        message: 'Proof generated successfully. The proof demonstrates token ownership without revealing balance.',
        verification_info: {
          circuit_id: 'holder',
          public_inputs: ['tokenHash', 'valid (1 = true)'],
          what_is_proven: 'User holds at least 1 token',
        },
      });
    } catch (error) {
      logger.error('Holder proof generation failed:', error);
      return errorResponse(
        res,
        'PROOF_GENERATION_FAILED',
        error.message,
        400
      );
    }
  })
);

/**
 * POST /v1/zk/threshold-proof
 * Generate a generic threshold proof
 * Proves: value >= threshold for any numeric value
 */
router.post(
  '/threshold-proof',
  strictRateLimit,
  validateBody(Joi.object({
    value: Joi.alternatives().try(
      Joi.number().integer().min(0),
      Joi.string().pattern(/^\d+$/)
    ).required().description('Actual value (private)'),
    threshold: Joi.alternatives().try(
      Joi.number().integer().min(0),
      Joi.string().pattern(/^\d+$/)
    ).required().description('Minimum value to prove (public)'),
  })),
  asyncHandler(async (req, res) => {
    const { value, threshold } = req.body;

    try {
      const result = await ZkService.generateThresholdProof(value, threshold);

      return successResponse(res, {
        success: true,
        circuit: 'threshold_proof',
        proof: result.proof,
        public_signals: result.publicSignals,
        threshold: result.threshold,
        message: 'Proof generated successfully. The proof demonstrates value >= threshold.',
        verification_info: {
          circuit_id: 'threshold',
          public_inputs: ['threshold', 'valid (1 = true)'],
          what_is_proven: `Value is at least ${threshold}`,
        },
      });
    } catch (error) {
      logger.error('Threshold proof generation failed:', error);
      return errorResponse(
        res,
        'PROOF_GENERATION_FAILED',
        error.message,
        400
      );
    }
  })
);

/**
 * POST /v1/zk/hash-token
 * Hash a token address using Poseidon (for use with holder-proof)
 */
router.post(
  '/hash-token',
  validateBody(Joi.object({
    token_address: Joi.string().required().description('Token mint address to hash'),
  })),
  asyncHandler(async (req, res) => {
    const { token_address } = req.body;

    try {
      const hash = await ZkService.hashTokenAddress(token_address);

      return successResponse(res, {
        token_address,
        token_hash: hash,
        message: 'Use this hash as token_hash in holder-proof requests',
      });
    } catch (error) {
      logger.error('Token hashing failed:', error);
      return errorResponse(
        res,
        'HASH_FAILED',
        error.message,
        400
      );
    }
  })
);

/**
 * POST /v1/zk/to-calldata
 * Convert proof to Solidity calldata for on-chain verification
 */
router.post(
  '/to-calldata',
  validateBody(Joi.object({
    proof: Joi.object().required(),
    public_signals: Joi.array().items(Joi.string()).required(),
  })),
  asyncHandler(async (req, res) => {
    const { proof, public_signals } = req.body;

    try {
      const calldata = await ZkService.proofToCalldata(proof, public_signals);

      return successResponse(res, {
        calldata,
        message: 'Use this calldata to verify the proof on-chain',
      });
    } catch (error) {
      logger.error('Calldata conversion failed:', error);
      return errorResponse(
        res,
        'CONVERSION_FAILED',
        error.message,
        400
      );
    }
  })
);

module.exports = router;

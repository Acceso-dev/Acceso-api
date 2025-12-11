/**
 * ZK Proof Service
 * Handles Zero-Knowledge proof generation and verification using snarkjs
 * 
 * Circuits:
 * - balance_threshold: Prove balance >= threshold
 * - token_holder: Prove token ownership
 * - threshold_proof: Generic threshold proof
 */

const Bull = require('bull');
const path = require('path');
const fs = require('fs');
const snarkjs = require('snarkjs');
const logger = require('../utils/logger');
const config = require('../config/app');
const { ZkProof } = require('../models');
const WebhookService = require('./webhook');

// Circuit paths
const CIRCUITS_DIR = path.join(__dirname, '../circuits');
const COMPILED_DIR = path.join(CIRCUITS_DIR, 'compiled');
const KEYS_DIR = path.join(CIRCUITS_DIR, 'keys');

// Circuit names mapping
const CIRCUIT_NAMES = {
  balance: 'balance_threshold',
  holder: 'token_holder',
  threshold: 'threshold_proof'
};

// Available circuits
const CIRCUITS = [
  {
    id: 'balance',
    name: 'Balance Threshold Proof',
    description: 'Prove wallet balance >= threshold without revealing actual balance',
    inputSchema: {
      balance: 'number (lamports/wei)',
      threshold: 'number (lamports/wei)',
    },
    publicInputs: ['threshold'],
    privateInputs: ['balance'],
    constraints: 64,
    provingTimeEstimate: '1-3 seconds',
    useCases: ['Wallet verification', 'Minimum balance proofs', 'Financial privacy'],
  },
  {
    id: 'holder',
    name: 'Token Holder Proof',
    description: 'Prove token ownership (balance > 0) without revealing amount',
    inputSchema: {
      balance: 'number',
      tokenAddress: 'string',
      tokenHash: 'string (poseidon hash)',
    },
    publicInputs: ['tokenHash'],
    privateInputs: ['balance', 'tokenAddress'],
    constraints: 280,
    provingTimeEstimate: '2-5 seconds',
    useCases: ['Token gating', 'Membership proofs', 'DAO voting eligibility'],
  },
  {
    id: 'threshold',
    name: 'Generic Threshold Proof',
    description: 'Prove any numeric value >= threshold',
    inputSchema: {
      value: 'number',
      threshold: 'number',
    },
    publicInputs: ['threshold'],
    privateInputs: ['value'],
    constraints: 64,
    provingTimeEstimate: '1-3 seconds',
    useCases: ['Age verification', 'Credit score proofs', 'Any numeric threshold'],
  },
];

// Proof generation queue
const proofQueue = new Bull('zk-proof-generation', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 50,
    attempts: 2,
    timeout: config.zkProof.timeoutMs,
  },
});

// Process proof jobs
proofQueue.process(async (job) => {
  const { proofId, circuitId, inputs, callbackUrl, userId } = job.data;
  
  try {
    await generateProofInternal(proofId, circuitId, inputs, callbackUrl, userId);
  } catch (error) {
    logger.error('Proof generation failed:', {
      proofId,
      circuitId,
      error: error.message,
    });
    throw error;
  }
});

/**
 * List available circuits
 */
function listCircuits() {
  return CIRCUITS;
}

/**
 * Get circuit by ID
 */
function getCircuit(circuitId) {
  return CIRCUITS.find((c) => c.id === circuitId) || null;
}

/**
 * Queue proof generation
 */
async function queueProofGeneration(proofId, data) {
  const circuit = getCircuit(data.circuitId);
  
  if (!circuit) {
    throw new Error(`Circuit ${data.circuitId} not found`);
  }

  // Check queue size
  const queueSize = await proofQueue.getWaitingCount();
  if (queueSize >= config.zkProof.maxQueueSize) {
    throw new Error('Proof queue is full. Please try again later.');
  }

  await proofQueue.add(data);
  
  logger.info('Proof generation queued:', { proofId, circuitId: data.circuitId });
}

/**
 * Internal proof generation
 */
async function generateProofInternal(proofId, circuitId, inputs, callbackUrl, userId) {
  const startTime = Date.now();

  try {
    // Update status to processing
    await ZkProof.updateStatus(proofId, { status: 'processing' });

    // Simulate proof generation (replace with actual snarkjs implementation)
    // In production, use snarkjs.groth16.fullProve()
    const proof = await simulateProofGeneration(circuitId, inputs);

    const duration = Date.now() - startTime;

    // Update with completed proof
    await ZkProof.updateStatus(proofId, {
      status: 'completed',
      proof: proof.proof,
      publicSignals: proof.publicSignals,
      duration,
    });

    logger.info('Proof generated successfully:', {
      proofId,
      circuitId,
      duration,
    });

    // Send webhook notification if callback URL provided
    if (callbackUrl) {
      await WebhookService.sendNotification(callbackUrl, {
        event: 'proof.completed',
        proof_id: proofId,
        circuit_id: circuitId,
        status: 'completed',
        duration_ms: duration,
      });
    }

    return proof;

  } catch (error) {
    const duration = Date.now() - startTime;

    await ZkProof.updateStatus(proofId, {
      status: 'failed',
      error: error.message,
      duration,
    });

    // Send failure webhook
    if (callbackUrl) {
      await WebhookService.sendNotification(callbackUrl, {
        event: 'proof.failed',
        proof_id: proofId,
        circuit_id: circuitId,
        status: 'failed',
        error: error.message,
      });
    }

    throw error;
  }
}

/**
 * Simulate proof generation (for development)
 * Replace with actual snarkjs implementation
 */
async function simulateProofGeneration(circuitId, inputs) {
  // Use real snarkjs proof generation
  const circuitName = CIRCUIT_NAMES[circuitId];
  
  if (!circuitName) {
    throw new Error(`Unknown circuit: ${circuitId}`);
  }
  
  const wasmPath = path.join(COMPILED_DIR, `${circuitName}_js`, `${circuitName}.wasm`);
  const zkeyPath = path.join(KEYS_DIR, `${circuitName}_final.zkey`);
  
  // Check if circuit files exist
  if (!fs.existsSync(wasmPath)) {
    throw new Error(`Circuit WASM not found: ${circuitName}`);
  }
  if (!fs.existsSync(zkeyPath)) {
    throw new Error(`Circuit zkey not found: ${circuitName}`);
  }
  
  // Prepare inputs based on circuit type
  let circuitInputs;
  
  if (circuitId === 'balance') {
    circuitInputs = {
      balance: BigInt(inputs.balance).toString(),
      threshold: BigInt(inputs.threshold).toString()
    };
  } else if (circuitId === 'holder') {
    // Convert token address to number
    const tokenNum = BigInt('0x' + Buffer.from(inputs.tokenAddress || '').slice(0, 31).toString('hex') || '0');
    circuitInputs = {
      balance: BigInt(inputs.balance).toString(),
      tokenAddress: tokenNum.toString(),
      tokenHash: inputs.tokenHash
    };
  } else if (circuitId === 'threshold') {
    circuitInputs = {
      value: BigInt(inputs.value).toString(),
      threshold: BigInt(inputs.threshold).toString()
    };
  }
  
  // Generate real proof using snarkjs
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInputs,
    wasmPath,
    zkeyPath
  );
  
  return { proof, publicSignals };
}

/**
 * Verify a proof using snarkjs
 */
async function verifyProof(circuitId, proof, publicSignals) {
  const circuit = getCircuit(circuitId);
  
  if (!circuit) {
    throw new Error(`Circuit ${circuitId} not found`);
  }
  
  const circuitName = CIRCUIT_NAMES[circuitId];
  const vkPath = path.join(KEYS_DIR, `${circuitName}_verification_key.json`);
  
  if (!fs.existsSync(vkPath)) {
    throw new Error(`Verification key not found for circuit: ${circuitId}`);
  }
  
  const vk = JSON.parse(fs.readFileSync(vkPath, 'utf8'));
  
  // Verify using snarkjs
  const isValid = await snarkjs.groth16.verify(vk, publicSignals, proof);
  
  return isValid;
}

/**
 * Generate balance threshold proof directly (synchronous API)
 */
async function generateBalanceProof(balance, threshold) {
  const balanceNum = BigInt(balance);
  const thresholdNum = BigInt(threshold);
  
  if (balanceNum < thresholdNum) {
    throw new Error('Balance is below threshold - cannot generate valid proof');
  }
  
  const inputs = {
    balance: balanceNum.toString(),
    threshold: thresholdNum.toString()
  };
  
  const wasmPath = path.join(COMPILED_DIR, 'balance_threshold_js', 'balance_threshold.wasm');
  const zkeyPath = path.join(KEYS_DIR, 'balance_threshold_final.zkey');
  
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    inputs,
    wasmPath,
    zkeyPath
  );
  
  return {
    proof,
    publicSignals,
    threshold: threshold.toString(),
    circuit: 'balance'
  };
}

/**
 * Generate holder proof directly
 */
async function generateHolderProof(balance, tokenAddress, tokenHash) {
  const balanceNum = BigInt(balance);
  
  if (balanceNum <= 0n) {
    throw new Error('Must have positive balance to prove holder status');
  }
  
  const tokenNum = BigInt('0x' + Buffer.from(tokenAddress).slice(0, 31).toString('hex'));
  
  const inputs = {
    balance: balanceNum.toString(),
    tokenAddress: tokenNum.toString(),
    tokenHash: tokenHash
  };
  
  const wasmPath = path.join(COMPILED_DIR, 'token_holder_js', 'token_holder.wasm');
  const zkeyPath = path.join(KEYS_DIR, 'token_holder_final.zkey');
  
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    inputs,
    wasmPath,
    zkeyPath
  );
  
  return {
    proof,
    publicSignals,
    tokenHash,
    circuit: 'holder'
  };
}

/**
 * Generate threshold proof directly
 */
async function generateThresholdProof(value, threshold) {
  const valueNum = BigInt(value);
  const thresholdNum = BigInt(threshold);
  
  if (valueNum < thresholdNum) {
    throw new Error('Value is below threshold - cannot generate valid proof');
  }
  
  const inputs = {
    value: valueNum.toString(),
    threshold: thresholdNum.toString()
  };
  
  const wasmPath = path.join(COMPILED_DIR, 'threshold_proof_js', 'threshold_proof.wasm');
  const zkeyPath = path.join(KEYS_DIR, 'threshold_proof_final.zkey');
  
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    inputs,
    wasmPath,
    zkeyPath
  );
  
  return {
    proof,
    publicSignals,
    threshold: threshold.toString(),
    circuit: 'threshold'
  };
}

/**
 * Hash token address using Poseidon
 */
async function hashTokenAddress(tokenAddress) {
  const { buildPoseidon } = require('circomlibjs');
  const poseidon = await buildPoseidon();
  
  const tokenNum = BigInt('0x' + Buffer.from(tokenAddress).slice(0, 31).toString('hex'));
  const hash = poseidon.F.toString(poseidon([tokenNum]));
  
  return hash;
}

/**
 * Convert proof to Solidity calldata for on-chain verification
 */
async function proofToCalldata(proof, publicSignals) {
  const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  return calldata;
}

/**
 * Get queue stats
 */
async function getQueueStats() {
  const [waiting, active, completed, failed] = await Promise.all([
    proofQueue.getWaitingCount(),
    proofQueue.getActiveCount(),
    proofQueue.getCompletedCount(),
    proofQueue.getFailedCount(),
  ]);

  return { waiting, active, completed, failed };
}

module.exports = {
  listCircuits,
  getCircuit,
  queueProofGeneration,
  verifyProof,
  getQueueStats,
  proofQueue,
  // Direct proof generation functions
  generateBalanceProof,
  generateHolderProof,
  generateThresholdProof,
  hashTokenAddress,
  proofToCalldata,
  CIRCUIT_NAMES,
};

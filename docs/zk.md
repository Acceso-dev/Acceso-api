# Zero-Knowledge Proof API Documentation

## Overview

The Acceso API provides privacy-preserving Zero-Knowledge Proof (ZKP) endpoints that allow users to prove statements about their data without revealing the underlying information. Built using **snarkjs** with **Groth16** protocol on the **bn128** elliptic curve.

---

## Authentication

All ZK endpoints require API key authentication:

```
X-API-Key: acceso_ent_xxxxxxxxxxxxx
```

---

## Base URL

```
https://api.acceso.dev/v1/zk
```

---

## Available Circuits

| Circuit ID | Name | Description | Proving Time |
|------------|------|-------------|--------------|
| `balance` | Balance Threshold | Prove balance ≥ threshold | ~2-3 sec |
| `holder` | Token Holder | Prove token ownership | ~3-5 sec |
| `threshold` | Generic Threshold | Prove any value ≥ threshold | ~2-3 sec |

---

## Endpoints

### 1. List Circuits

**GET** `/v1/zk/circuits`

Returns all available ZK proof circuits.

**Response:**
```json
{
  "success": true,
  "data": {
    "circuits": [
      {
        "id": "balance",
        "name": "Balance Threshold Proof",
        "description": "Prove wallet balance >= threshold without revealing actual balance",
        "input_schema": {
          "balance": "number (lamports/wei)",
          "threshold": "number (lamports/wei)"
        },
        "constraints": 64,
        "proving_time_estimate": "1-3 seconds"
      }
    ]
  }
}
```

---

### 2. Generate Balance Proof

**POST** `/v1/zk/balance-proof`

Proves that a wallet balance is greater than or equal to a threshold without revealing the actual balance.

**Request Body:**
```json
{
  "balance": 1000000000,
  "threshold": 100000000
}
```

| Field | Type | Description |
|-------|------|-------------|
| `balance` | number/string | Actual balance in smallest units (lamports for Solana, wei for ETH) |
| `threshold` | number/string | Minimum balance to prove |

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "circuit": "balance_threshold",
    "proof": {
      "pi_a": ["924788289...", "243876838...", "1"],
      "pi_b": [["679004523...", "136866186..."], ["602918470...", "421980756..."], ["1", "0"]],
      "pi_c": ["201446057...", "562961497...", "1"],
      "protocol": "groth16",
      "curve": "bn128"
    },
    "public_signals": ["1", "100000000"],
    "threshold": "100000000",
    "message": "Proof generated successfully. The proof demonstrates balance >= threshold without revealing actual balance.",
    "verification_info": {
      "circuit_id": "balance",
      "public_inputs": ["threshold", "valid (1 = true)"],
      "what_is_proven": "Balance is at least 100000000 units"
    }
  }
}
```

**Use Cases:**
- Wallet verification for DeFi protocols
- Minimum balance requirements for airdrops
- Financial privacy for transactions

---

### 3. Generate Threshold Proof

**POST** `/v1/zk/threshold-proof`

Generic proof that any numeric value meets a minimum threshold. Perfect for age verification, credit scores, etc.

**Request Body:**
```json
{
  "value": 25,
  "threshold": 18
}
```

| Field | Type | Description |
|-------|------|-------------|
| `value` | number/string | Actual value (private - kept secret) |
| `threshold` | number/string | Minimum value to prove (public) |

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "circuit": "threshold_proof",
    "proof": { ... },
    "public_signals": ["1", "18"],
    "threshold": "18",
    "message": "Proof generated successfully. The proof demonstrates value >= threshold.",
    "verification_info": {
      "circuit_id": "threshold",
      "public_inputs": ["threshold", "valid (1 = true)"],
      "what_is_proven": "Value is at least 18"
    }
  }
}
```

**Use Cases:**
- Age verification (prove age ≥ 18)
- Credit score verification (prove score ≥ 700)
- Any numeric threshold requirement

---

### 4. Generate Holder Proof

**POST** `/v1/zk/holder-proof`

Proves that a user holds a specific token (balance > 0) without revealing how many tokens they own.

**Request Body:**
```json
{
  "balance": 1000000,
  "token_address": "So11111111111111111111111111111111111111112",
  "token_hash": "4379548025633458210896766707438305005912989850633610585395288336655574203322"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `balance` | number/string | Token balance (must be > 0) |
| `token_address` | string | Token mint address |
| `token_hash` | string | Poseidon hash of token address (get from `/hash-token`) |

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "circuit": "token_holder",
    "proof": { ... },
    "public_signals": ["1", "4379548025..."],
    "token_hash": "4379548025...",
    "message": "Proof generated successfully. The proof demonstrates token ownership without revealing balance.",
    "verification_info": {
      "circuit_id": "holder",
      "public_inputs": ["tokenHash", "valid (1 = true)"],
      "what_is_proven": "User holds at least 1 token"
    }
  }
}
```

**Use Cases:**
- Token gating for communities
- DAO voting eligibility
- NFT membership verification

---

### 5. Hash Token Address

**POST** `/v1/zk/hash-token`

Hashes a token address using Poseidon hash function. Required for holder-proof.

**Request Body:**
```json
{
  "token_address": "So11111111111111111111111111111111111111112"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token_address": "So11111111111111111111111111111111111111112",
    "token_hash": "4379548025633458210896766707438305005912989850633610585395288336655574203322",
    "message": "Use this hash as token_hash in holder-proof requests"
  }
}
```

---

### 6. Verify Proof

**POST** `/v1/zk/proofs/verify`

Verifies a zero-knowledge proof. Anyone can verify a proof without knowing the private inputs.

**Request Body:**
```json
{
  "circuit_id": "balance",
  "proof": {
    "pi_a": ["924788289...", "243876838...", "1"],
    "pi_b": [["679004523...", "136866186..."], ["602918470...", "421980756..."], ["1", "0"]],
    "pi_c": ["201446057...", "562961497...", "1"],
    "protocol": "groth16",
    "curve": "bn128"
  },
  "public_signals": ["1", "100000000"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `circuit_id` | string | Circuit used: `balance`, `holder`, or `threshold` |
| `proof` | object | The proof object from generation |
| `public_signals` | array | Public signals from proof generation |

**Response:**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "circuit_id": "balance",
    "verified_at": "2025-12-10T17:49:07.754Z"
  }
}
```

---

### 7. Convert to Solidity Calldata

**POST** `/v1/zk/to-calldata`

Converts a proof to Solidity calldata format for on-chain verification.

**Request Body:**
```json
{
  "proof": { ... },
  "public_signals": ["1", "100000000"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "calldata": "0x...",
    "message": "Use this calldata to verify the proof on-chain"
  }
}
```

---

## Technical Architecture

### Circuit Files
```
src/circuits/
├── balance_threshold.circom    # Balance >= threshold circuit
├── token_holder.circom         # Token ownership circuit
├── threshold_proof.circom      # Generic threshold circuit
├── compiled/                   # Compiled WASM files
│   ├── balance_threshold_js/
│   ├── token_holder_js/
│   └── threshold_proof_js/
└── keys/                       # Proving/verification keys
    ├── balance_threshold_final.zkey
    ├── balance_threshold_verification_key.json
    ├── token_holder_final.zkey
    ├── token_holder_verification_key.json
    ├── threshold_proof_final.zkey
    └── threshold_proof_verification_key.json
```

### Proof System Specifications

| Property | Value |
|----------|-------|
| Protocol | Groth16 |
| Curve | bn128 (BN254) |
| Hash Function | Poseidon |
| Constraint System | R1CS |
| Powers of Tau | pot12.ptau (2^12 constraints) |

### Circuit Constraints

| Circuit | Non-linear | Linear | Wires |
|---------|------------|--------|-------|
| balance_threshold | 64 | 3 | 69 |
| threshold_proof | 64 | 3 | 69 |
| token_holder | 280 | 202 | 484 |

---

## Error Handling

### Common Errors

**Balance Below Threshold:**
```json
{
  "success": false,
  "error": {
    "code": "PROOF_GENERATION_FAILED",
    "message": "Balance is below threshold - cannot generate valid proof"
  }
}
```

**Invalid Circuit:**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CIRCUIT",
    "message": "Circuit not found"
  }
}
```

**Proof Verification Failed:**
```json
{
  "success": false,
  "data": {
    "valid": false,
    "circuit_id": "balance"
  }
}
```

---

## Rate Limits

| Tier | Proof Generation | Verification |
|------|-----------------|--------------|
| Free | 10/hour | 100/hour |
| Pro | 100/hour | 1000/hour |
| Enterprise | Unlimited | Unlimited |

---

## Example Workflow

### Proving Wallet Has ≥ 1 SOL

1. **Get balance** (from Solana RPC or your records)
   - Balance: 2,500,000,000 lamports (2.5 SOL)

2. **Generate proof**
```bash
curl -X POST "https://api.acceso.dev/v1/zk/balance-proof" \
  -H "X-API-Key: acceso_ent_xxx" \
  -H "Content-Type: application/json" \
  -d '{"balance": 2500000000, "threshold": 1000000000}'
```

3. **Share proof with verifier**
   - Send only: `proof` + `public_signals`
   - Verifier sees: threshold = 1 SOL, valid = true
   - Verifier NEVER sees: actual balance (2.5 SOL)

4. **Verify proof**
```bash
curl -X POST "https://api.acceso.dev/v1/zk/proofs/verify" \
  -H "X-API-Key: acceso_ent_xxx" \
  -H "Content-Type: application/json" \
  -d '{"circuit_id": "balance", "proof": {...}, "public_signals": ["1", "1000000000"]}'
```

---

## Security Considerations

1. **Private Inputs Stay Private** - The actual balance/value is never sent to anyone
2. **Trusted Setup** - Keys generated using Powers of Tau ceremony
3. **Proof Soundness** - Mathematically impossible to fake a valid proof
4. **No Replay Attacks** - Each proof is unique to the inputs

---

## Dependencies

- **snarkjs** ^0.7.0 - Proof generation and verification
- **circomlibjs** ^0.1.7 - Poseidon hash implementation
- **circom** 2.2.3 - Circuit compiler
- **ffjavascript** - Finite field arithmetic

---

## Support

For questions or issues with ZK proofs:
- GitHub: https://github.com/Acceso-dev/Acceso-Api
- API Status: https://api.acceso.dev/health

---

## Integration with Acceso API - Complete Workflow

This section demonstrates how to integrate ZK proofs with other Acceso API endpoints for real-world privacy-preserving applications.

### Use Case 1: Privacy-Preserving Wallet Verification

**Scenario:** A DeFi protocol wants to verify that a user has at least 1 SOL before allowing access to premium features, without ever seeing the actual balance.

**Step 1: Get Wallet Balance (using Solana endpoint)**

```bash
curl -s "http://localhost:3000/v1/solana/account?address=FGQ3rrA6tPdL4EHMvpZY4rQoMKtp58qvyxBSV5M28DWt" \
  -H "X-API-Key: acceso_ent_xxx"
```

Response (only visible to wallet owner):
```json
{
  "success": true,
  "data": {
    "address": "FGQ3rrA6tPdL4EHMvpZY4rQoMKtp58qvyxBSV5M28DWt",
    "balance": 5000000000,
    "balance_sol": 5.0
  }
}
```

**Step 2: Generate ZK Proof (wallet owner generates locally)**

```bash
curl -X POST "http://localhost:3000/v1/zk/balance-proof" \
  -H "X-API-Key: acceso_ent_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "balance": 5000000000,
    "threshold": 1000000000
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "success": true,
    "circuit": "balance_threshold",
    "proof": {
      "pi_a": [
        "19608189738850133976181449948464833932598841627122731155919796039239198981043",
        "11220475230358451297649127354487867094359830668936021062077296696904331104033",
        "1"
      ],
      "pi_b": [
        ["18176624494983538726306049673992087872438188552947675847196690075675381598629", "19714594460163759669776486915659772445414138858861650518341539696326730747214"],
        ["3807704304816094601266468243316485028819498558133454555432818291128425812429", "21337636410817465778542245039355815837661075484887327261886001567565450683452"],
        ["1", "0"]
      ],
      "pi_c": [
        "11756215457511552322398100167356503813473609892499981271829629551590763678204",
        "21805694097572831497844504611210786539281591079129261269202958281879655233070",
        "1"
      ],
      "protocol": "groth16",
      "curve": "bn128"
    },
    "public_signals": ["1", "1000000000"],
    "threshold": "1000000000",
    "message": "Proof generated successfully. The proof demonstrates balance >= threshold without revealing actual balance.",
    "verification_info": {
      "circuit_id": "balance",
      "public_inputs": ["threshold", "valid (1 = true)"],
      "what_is_proven": "Balance is at least 1000000000 units"
    }
  }
}
```

**Step 3: Share Proof with Verifier (DeFi protocol)**

The wallet owner shares ONLY:
- `proof` object
- `public_signals` array

The verifier NEVER sees:
- Actual balance (5 SOL)
- Wallet private key
- Any transaction history

**Step 4: Verifier Validates the Proof**

```bash
curl -X POST "http://localhost:3000/v1/zk/proofs/verify" \
  -H "X-API-Key: acceso_ent_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "circuit_id": "balance",
    "proof": {
      "pi_a": ["19608189738850133976181449948464833932598841627122731155919796039239198981043", "11220475230358451297649127354487867094359830668936021062077296696904331104033", "1"],
      "pi_b": [["18176624494983538726306049673992087872438188552947675847196690075675381598629", "19714594460163759669776486915659772445414138858861650518341539696326730747214"], ["3807704304816094601266468243316485028819498558133454555432818291128425812429", "21337636410817465778542245039355815837661075484887327261886001567565450683452"], ["1", "0"]],
      "pi_c": ["11756215457511552322398100167356503813473609892499981271829629551590763678204", "21805694097572831497844504611210786539281591079129261269202958281879655233070", "1"],
      "protocol": "groth16",
      "curve": "bn128"
    },
    "public_signals": ["1", "1000000000"]
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "valid": true,
    "circuit_id": "balance",
    "verified_at": "2025-12-11T04:49:45.572Z"
  }
}
```

✅ **Result:** The DeFi protocol now knows the user has ≥ 1 SOL, but has zero knowledge of the actual balance!

---

### Use Case 2: Token-Gated Community Access

**Scenario:** A DAO wants to verify members hold their governance token without revealing exact holdings.

**Step 1: Hash the Token Address**

```bash
curl -X POST "http://localhost:3000/v1/zk/hash-token" \
  -H "X-API-Key: acceso_ent_xxx" \
  -H "Content-Type: application/json" \
  -d '{"token_address": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"}'
```

Response:
```json
{
  "success": true,
  "data": {
    "token_address": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "token_hash": "1234567890123456789012345678901234567890123456789012345678901234",
    "message": "Use this hash as token_hash in holder-proof requests"
  }
}
```

**Step 2: Generate Holder Proof**

```bash
curl -X POST "http://localhost:3000/v1/zk/holder-proof" \
  -H "X-API-Key: acceso_ent_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "balance": 50000,
    "token_address": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "token_hash": "1234567890123456789012345678901234567890123456789012345678901234"
  }'
```

**Step 3: DAO Verifies Membership**

The DAO only sees:
- User holds the token ✅
- Token hash matches expected ✅

The DAO does NOT see:
- How many tokens (could be 1 or 1,000,000)
- When tokens were acquired
- Transaction history

---

### Use Case 3: Age Verification (KYC Alternative)

**Scenario:** Prove a user is 18+ without revealing birth date or exact age.

```bash
curl -X POST "http://localhost:3000/v1/zk/threshold-proof" \
  -H "X-API-Key: acceso_ent_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "value": 25,
    "threshold": 18
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "success": true,
    "circuit": "threshold_proof",
    "proof": { ... },
    "public_signals": ["1", "18"],
    "threshold": "18",
    "verification_info": {
      "what_is_proven": "Value is at least 18"
    }
  }
}
```

The service knows: User is 18+ ✅
The service does NOT know: User is exactly 25 years old

---

### Integration Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        ACCESO API                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐        │
│  │   Solana    │     │     ZK      │     │  Polymarket │        │
│  │  Endpoints  │     │  Endpoints  │     │  Endpoints  │        │
│  └──────┬──────┘     └──────┬──────┘     └─────────────┘        │
│         │                   │                                    │
│         ▼                   ▼                                    │
│  ┌─────────────┐     ┌─────────────┐                            │
│  │ Get Balance │     │  Generate   │                            │
│  │ Get Tokens  │────▶│    Proof    │                            │
│  └─────────────┘     └──────┬──────┘                            │
│                             │                                    │
│                             ▼                                    │
│                      ┌─────────────┐                            │
│                      │   Verify    │                            │
│                      │    Proof    │                            │
│                      └──────┬──────┘                            │
│                             │                                    │
└─────────────────────────────┼────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Third Party    │
                    │   Verifier      │
                    │  (DeFi/DAO/KYC) │
                    └─────────────────┘
```

---

### API Response Times (Tested)

| Endpoint | Average Time | Notes |
|----------|--------------|-------|
| `/v1/zk/balance-proof` | 2-3 seconds | First call may be slower (~5s) |
| `/v1/zk/threshold-proof` | 2-3 seconds | Consistent performance |
| `/v1/zk/holder-proof` | 3-5 seconds | More constraints = slower |
| `/v1/zk/proofs/verify` | 1-2 seconds | Fast verification |
| `/v1/zk/hash-token` | ~2 seconds | Poseidon hash computation |
| `/v1/zk/circuits` | <100ms | Returns circuit metadata |

---

### JavaScript SDK Example

```javascript
const axios = require('axios');

const API_KEY = 'acceso_ent_xxx';
const BASE_URL = 'http://localhost:3000/v1';

// Generate balance proof
async function proveBalance(actualBalance, threshold) {
  const response = await axios.post(`${BASE_URL}/zk/balance-proof`, {
    balance: actualBalance,
    threshold: threshold
  }, {
    headers: { 'X-API-Key': API_KEY }
  });
  
  return {
    proof: response.data.data.proof,
    publicSignals: response.data.data.public_signals
  };
}

// Verify proof
async function verifyProof(circuitId, proof, publicSignals) {
  const response = await axios.post(`${BASE_URL}/zk/proofs/verify`, {
    circuit_id: circuitId,
    proof: proof,
    public_signals: publicSignals
  }, {
    headers: { 'X-API-Key': API_KEY }
  });
  
  return response.data.data.valid;
}

// Example usage
async function main() {
  // User has 5 SOL, wants to prove they have at least 1 SOL
  const { proof, publicSignals } = await proveBalance(5000000000, 1000000000);
  console.log('Proof generated!');
  
  // Verifier checks the proof
  const isValid = await verifyProof('balance', proof, publicSignals);
  console.log('Proof valid:', isValid);
}

main();
```

---

### Best Practices

1. **Generate proofs client-side when possible** - The private input (actual balance) should never leave the user's device in production

2. **Cache token hashes** - The same token address always produces the same hash

3. **Use appropriate circuits**:
   - `balance` for wallet SOL/ETH balance
   - `holder` for token ownership
   - `threshold` for any numeric comparison

4. **Handle proof generation failures gracefully** - If balance < threshold, proof generation will fail

5. **Store proofs if needed** - Proofs are deterministic but unique per input set

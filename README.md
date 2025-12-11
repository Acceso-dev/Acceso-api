<div align="center">

# 🚀 Acceso API

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)
[![API Status](https://img.shields.io/badge/API-live-success)](https://api.acceso.dev/health)
[![Solana](https://img.shields.io/badge/Solana-integrated-blueviolet)](https://solana.com)
[![ZK Proofs](https://img.shields.io/badge/ZK-Groth16-orange)](https://github.com/Acceso-dev/Acceso-ZKP)

**Clean, Lightweight API Infrastructure for Web3**

*Solana • Polymarket • Zero-Knowledge Proofs • Real-time Data*

[Getting Started](#-quick-start) •
[API Reference](#-api-endpoints) •
[Documentation](docs/) •
[ZK Proofs](docs/zk.md)

</div>

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔗 **Solana Integration** | Full RPC proxy, account info, token balances, DEX trades (Jupiter, Raydium, Orca) |
| 📊 **Polymarket Data** | Real-time prediction markets, prices, orderbooks, events |
| 🔐 **Zero-Knowledge Proofs** | Privacy-preserving proofs with Groth16 (balance, holder, threshold) |
| ⚡ **High Performance** | Redis caching, connection pooling, cluster mode |
| 🛡️ **Enterprise Security** | API key tiers, rate limiting, request validation |
| 📈 **Bitquery GraphQL** | On-chain analytics, token trades, balance history |

---

## 📁 Project Structure

```
api.acceso.dev/
├── src/
│   ├── routes/v1/
│   │   ├── solana/           # 18 Solana endpoints
│   │   ├── polymarket/       # 13 Polymarket endpoints  
│   │   ├── zk/               # 7 Zero-Knowledge proof endpoints
│   │   ├── workflows/        # Automation engine
│   │   └── webhooks/         # Event notifications
│   ├── services/             # Business logic layer
│   ├── middleware/           # Auth, rate limiting, validation
│   ├── circuits/             # ZK circuits (circom)
│   └── config/               # App configuration
├── docs/                     # API documentation
│   └── zk.md                 # ZK Proofs documentation
└── tests/                    # Test suite
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 18.x
- **PostgreSQL** 14+
- **Redis** 7+

### Installation

```bash
# Clone the repository
git clone https://github.com/Acceso-dev/Acceso-Api.git
cd Acceso-Api

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Run database migrations
npx prisma migrate deploy

# Start development server
npm run dev

# Production (cluster mode)
npm run cluster
```

---

## 🔐 Authentication

All API endpoints require authentication via API key:

```bash
curl -H "X-API-Key: acceso_ent_xxxxx" https://api.acceso.dev/v1/solana/account/...
```

### API Key Tiers

| Tier | Prefix | Rate Limit | Features |
|------|--------|------------|----------|
| Free | `acceso_free_` | 100/hour | Basic endpoints |
| Pro | `acceso_pro_` | 1,000/hour | + Priority support |
| Enterprise | `acceso_ent_` | Unlimited | + ZK Proofs, Webhooks |

---

## 📡 API Endpoints

### Base URL
```
https://api.acceso.dev
```

---

### 🏥 Health & Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check (no auth) |
| `GET` | `/ready` | Readiness probe |
| `GET` | `/metrics` | Prometheus metrics |

---

### ⚡ Solana Endpoints (18 endpoints)

#### Account & Balance

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/solana/account` | Get account info |
| `GET` | `/v1/solana/balance` | Get SOL balance |
| `GET` | `/v1/solana/tokens` | Get token accounts |
| `GET` | `/v1/solana/token/price` | Get token price (Jupiter) |
| `POST` | `/v1/solana/prices` | Get multiple token prices |

**Example:**
```bash
curl "https://api.acceso.dev/v1/solana/account?address=FGQ3rrA6tPdL4EHMvpZY4rQoMKtp58qvyxBSV5M28DWt" \
  -H "X-API-Key: acceso_ent_xxx"
```

#### Bitquery Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/solana/balance-updates` | Recent balance changes |
| `GET` | `/v1/solana/balances` | Token balances with USD values |
| `GET` | `/v1/solana/balance-history` | Historical balance |
| `GET` | `/v1/solana/transfers` | Token transfers |
| `GET` | `/v1/solana/top-holders` | Top token holders |
| `POST` | `/v1/solana/graphql` | Custom Bitquery queries |

#### DEX Trading

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/solana/dex/trades` | All DEX trades |
| `GET` | `/v1/solana/dex/pump` | Pump.fun trades |
| `GET` | `/v1/solana/dex/raydium` | Raydium trades |
| `GET` | `/v1/solana/dex/orca` | Orca trades |
| `GET` | `/v1/solana/dex/jupiter` | Jupiter trades |
| `GET` | `/v1/solana/dex/ohlcv` | OHLCV candlestick data |

**Example - Get Jupiter Trades:**
```bash
curl "https://api.acceso.dev/v1/solana/dex/jupiter?limit=10" \
  -H "X-API-Key: acceso_ent_xxx"
```

---

### 📊 Polymarket Endpoints (13 endpoints)

#### Markets

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/polymarket/markets` | List all markets |
| `GET` | `/v1/polymarket/markets/featured` | Featured/trending markets |
| `GET` | `/v1/polymarket/markets/:id` | Get market details |
| `GET` | `/v1/polymarket/markets/:id/price` | Current market price |
| `GET` | `/v1/polymarket/markets/:id/price/history` | Price history |
| `GET` | `/v1/polymarket/markets/:id/orderbook` | Order book |

**Example:**
```bash
curl "https://api.acceso.dev/v1/polymarket/markets?limit=10&active=true" \
  -H "X-API-Key: acceso_ent_xxx"
```

#### Events & Discovery

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/polymarket/events` | List events |
| `GET` | `/v1/polymarket/events/:id` | Event details |
| `GET` | `/v1/polymarket/categories` | Market categories |
| `GET` | `/v1/polymarket/trending` | Trending markets |
| `GET` | `/v1/polymarket/search` | Search markets |
| `GET` | `/v1/polymarket/stats` | Platform statistics |
| `GET` | `/v1/polymarket/leaderboard` | Top traders |

---

### 🔐 Zero-Knowledge Proof Endpoints (7 endpoints)

Privacy-preserving proofs using **Groth16** protocol on **bn128** curve.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/zk/circuits` | List available circuits |
| `POST` | `/v1/zk/balance-proof` | Prove balance ≥ threshold |
| `POST` | `/v1/zk/threshold-proof` | Generic value ≥ threshold |
| `POST` | `/v1/zk/holder-proof` | Prove token ownership |
| `POST` | `/v1/zk/hash-token` | Hash token address (Poseidon) |
| `POST` | `/v1/zk/proofs/verify` | Verify a ZK proof |
| `POST` | `/v1/zk/to-calldata` | Convert to Solidity calldata |

**Example - Prove Balance ≥ 1 SOL:**
```bash
curl -X POST "https://api.acceso.dev/v1/zk/balance-proof" \
  -H "X-API-Key: acceso_ent_xxx" \
  -H "Content-Type: application/json" \
  -d '{"balance": 5000000000, "threshold": 1000000000}'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "circuit": "balance_threshold",
    "proof": { "pi_a": [...], "pi_b": [...], "pi_c": [...] },
    "public_signals": ["1", "1000000000"],
    "verification_info": {
      "what_is_proven": "Balance is at least 1000000000 units"
    }
  }
}
```

📚 **[Full ZK Documentation →](docs/zk.md)**

---

### 🔄 Workflow Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/workflows` | Create workflow |
| `GET` | `/v1/workflows` | List workflows |
| `GET` | `/v1/workflows/:id` | Get workflow |
| `PUT` | `/v1/workflows/:id` | Update workflow |
| `DELETE` | `/v1/workflows/:id` | Delete workflow |
| `POST` | `/v1/workflows/:id/execute` | Execute workflow |
| `POST` | `/v1/workflows/:id/enable` | Enable workflow |
| `POST` | `/v1/workflows/:id/disable` | Disable workflow |
| `GET` | `/v1/workflows/:id/history` | Execution history |

---

### 🔔 Webhook Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/webhooks` | Create webhook |
| `GET` | `/v1/webhooks` | List webhooks |
| `GET` | `/v1/webhooks/:id` | Get webhook |
| `PUT` | `/v1/webhooks/:id` | Update webhook |
| `DELETE` | `/v1/webhooks/:id` | Delete webhook |
| `POST` | `/v1/webhooks/:id/test` | Test webhook |
| `GET` | `/v1/webhooks/:id/deliveries` | Delivery logs |

---

## 📊 Response Format

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "request_id": "req_abc123def456",
    "timestamp": "2025-12-11T10:30:00.000Z",
    "cached": false
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please retry after 60 seconds.",
    "request_id": "req_abc123def456",
    "timestamp": "2025-12-11T10:30:00.000Z"
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Invalid or missing API key |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `VALIDATION_ERROR` | 400 | Invalid request parameters |
| `INTERNAL_ERROR` | 500 | Server error |

---

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| **Runtime** | Node.js 18+ |
| **Framework** | Express.js |
| **Database** | PostgreSQL (Neon) + Prisma ORM |
| **Cache** | Redis Cloud |
| **Blockchain** | Helius RPC, Jupiter API |
| **Analytics** | Bitquery GraphQL |
| **ZK Proofs** | snarkjs, circom 2.2.3 |
| **Auth** | Custom API key system |

---

## 📈 Performance

| Metric | Value |
|--------|-------|
| Average Response Time | < 100ms (cached) |
| ZK Proof Generation | 2-3 seconds |
| ZK Proof Verification | 1-2 seconds |
| Uptime SLA | 99.9% |

---

## 🔗 Related Repositories

- [Acceso-ZKP](https://github.com/Acceso-dev/Acceso-ZKP) - Zero-Knowledge Proof circuits and implementation

---

## 📜 License

MIT License © 2025 Acceso

```
MIT License

Copyright (c) 2025 Acceso

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

<div align="center">

**Built with ❤️ by Acceso**

[Website](https://acceso.dev) • [API Docs](https://api.acceso.dev) • [GitHub](https://github.com/Acceso-dev)

</div>

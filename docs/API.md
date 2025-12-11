# api.acceso.dev - API Documentation

## Overview
A clean, lightweight API infrastructure for prediction markets and blockchain data.

**Base URL:** `https://api.acceso.dev` (or `http://localhost:3000` for local development)

---

## Authentication

All API requests require an API key. Keys use the `acceso_` prefix format:
- `acceso_free_xxxx...` - Free tier
- `acceso_pro_xxxx...` - Pro tier  
- `acceso_ent_xxxx...` - Enterprise tier

### Providing Your API Key
```bash
# Header (recommended)
curl -H "X-API-Key: acceso_free_your_key_here" https://api.acceso.dev/v1/polymarket/markets

# Bearer token
curl -H "Authorization: Bearer acceso_free_your_key_here" https://api.acceso.dev/v1/polymarket/markets
```

---

## Auth Endpoints

### Register New Account
```http
POST /v1/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepass123",
  "name": "Your Name"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Account created successfully",
    "user": { "id": "xxx", "email": "user@example.com", "name": "Your Name" },
    "api_key": {
      "key": "acceso_free_xxxxxxxxxxxxxxxxxxxx",
      "name": "Default API Key",
      "tier": "free",
      "note": "Save this key securely. You will not be able to see it again!"
    }
  }
}
```

### Login
```http
POST /v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepass123"
}
```

### Test API Key
```http
POST /v1/auth/keys/test
X-API-Key: acceso_free_your_key_here
```

### List Your API Keys (requires auth)
```http
GET /v1/auth/keys
X-API-Key: acceso_xxx
```

### Create New API Key (requires auth)
```http
POST /v1/auth/keys
X-API-Key: acceso_xxx
Content-Type: application/json

{
  "name": "My Production Key",
  "tier": "pro",
  "expiresIn": 365
}
```

### Revoke API Key (requires auth)
```http
DELETE /v1/auth/keys/{key_id}
X-API-Key: acceso_xxx
```

### Get Current User (requires auth)
```http
GET /v1/auth/me
X-API-Key: acceso_xxx
```

---

## Polymarket Endpoints

### List Markets
```http
GET /v1/polymarket/markets?limit=20&page=1&sort=volume&order=desc
```

Query Parameters:
- `page` (default: 1)
- `limit` (1-100, default: 20)
- `status` (active|closed|all, default: active)
- `category` (optional)
- `search` (optional)
- `sort` (volume|liquidity|created|end_date)
- `order` (asc|desc)

### Search Markets
```http
GET /v1/polymarket/search?q=bitcoin&limit=20
```

### Get Trending Markets
```http
GET /v1/polymarket/trending
```

### Get Market Details
```http
GET /v1/polymarket/markets/{market_id}
```

### Get Market Price
```http
GET /v1/polymarket/markets/{market_id}/price
```

### Get Price History
```http
GET /v1/polymarket/markets/{market_id}/price/history?interval=1h&limit=100
```

Intervals: `1m`, `5m`, `15m`, `1h`, `4h`, `1d`

### Get Orderbook
```http
GET /v1/polymarket/markets/{market_id}/orderbook?depth=10
```

### Get Market Trades
```http
GET /v1/polymarket/markets/{market_id}/trades?limit=50
```

### Get Market Positions
```http
GET /v1/polymarket/markets/{market_id}/positions?limit=50
```

### Get Market Volume History
```http
GET /v1/polymarket/markets/{market_id}/volume?interval=1d&limit=30
```

### Get Featured Markets
```http
GET /v1/polymarket/markets/featured
```

### Get Categories
```http
GET /v1/polymarket/categories
```

### Get Events
```http
GET /v1/polymarket/events?limit=20&active=true
```

### Get Event Details
```http
GET /v1/polymarket/events/{event_id}
```

### Get Overall Stats
```http
GET /v1/polymarket/stats
```

---

## User Data Endpoints

### Get User Profile
```http
GET /v1/polymarket/users/{wallet_address}
```

### Get User Positions
```http
GET /v1/polymarket/users/{wallet_address}/positions?limit=100
```

### Get User Trades
```http
GET /v1/polymarket/users/{wallet_address}/trades?limit=100
```

### Get User Orders
```http
GET /v1/polymarket/users/{wallet_address}/orders?status=open
```

### Get User PnL
```http
GET /v1/polymarket/users/{wallet_address}/pnl
```

### Get User Activity
```http
GET /v1/polymarket/users/{wallet_address}/activity?limit=50
```

### Get Leaderboard
```http
GET /v1/polymarket/leaderboard?limit=100&timeframe=all
```

Timeframes: `day`, `week`, `month`, `all`

---

## WebSocket Endpoints

### Get WebSocket Status
```http
GET /v1/polymarket/ws/status
```

### Connect to WebSocket
```http
POST /v1/polymarket/ws/connect
```

### Subscribe to Crypto Prices
```http
POST /v1/polymarket/ws/subscribe/crypto-prices
```

### Subscribe to Market Orderbook
```http
POST /v1/polymarket/ws/subscribe/market
Content-Type: application/json

{
  "assetIds": ["token_id_1", "token_id_2"]
}
```

### Subscribe to Comments
```http
POST /v1/polymarket/ws/subscribe/comments
Content-Type: application/json

{
  "marketId": "optional_market_id"
}
```

### Unsubscribe
```http
POST /v1/polymarket/ws/unsubscribe
Content-Type: application/json

{
  "topic": "crypto_prices",
  "type": "subscribe"
}
```

---

## Health Check

```http
GET /health
```

No authentication required.

---

## Rate Limits

| Tier       | Requests/Minute | Keys Allowed |
|------------|-----------------|--------------|
| Free       | 100             | 3            |
| Pro        | 1000            | 10           |
| Enterprise | 10000           | 50           |

---

## Error Responses

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

Common Error Codes:
- `UNAUTHORIZED` - Missing or invalid API key
- `API_KEY_EXPIRED` - API key has expired
- `API_KEY_REVOKED` - API key was revoked
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `VALIDATION_ERROR` - Invalid request parameters
- `MARKET_NOT_FOUND` - Market not found

---

## Example Usage

### Python
```python
import requests

API_KEY = "acceso_free_your_key_here"
BASE_URL = "https://api.acceso.dev"

headers = {"X-API-Key": API_KEY}

# Get trending markets
response = requests.get(f"{BASE_URL}/v1/polymarket/trending", headers=headers)
markets = response.json()["data"]

for market in markets:
    print(f"{market['question']} - Yes: {market['yes_price']}")
```

### JavaScript
```javascript
const API_KEY = 'acceso_free_your_key_here';
const BASE_URL = 'https://api.acceso.dev';

async function getTrending() {
  const res = await fetch(`${BASE_URL}/v1/polymarket/trending`, {
    headers: { 'X-API-Key': API_KEY }
  });
  const data = await res.json();
  return data.data;
}
```

### cURL
```bash
# Search for markets
curl -s -H "X-API-Key: acceso_free_xxx" \
  "https://api.acceso.dev/v1/polymarket/search?q=bitcoin"

# Get market details
curl -s -H "X-API-Key: acceso_free_xxx" \
  "https://api.acceso.dev/v1/polymarket/markets/market_id_here"
```

---

## Test API Keys (Development Only)

```
Enterprise: acceso_ent_1a78a35dc1c0d5e8528bf177bf654ca7fa4dc392eaf6243b
Pro:        acceso_pro_ed7ef4579892e73c04949480547aeed47101006bb400995c
Free:       acceso_free_9b8a37749dc1e671b4376f0f92a25835d7b46b85e31d5bdd
```

Password for test accounts: `password123`

#!/bin/bash

# API Endpoint Test Script
# Tests all endpoints and saves responses to data/test-responses/

API_KEY="acceso_ent_1a78a35dc1c0d5e8528bf177bf654ca7fa4dc392eaf6243b"
BASE_URL="http://localhost:3000"
OUTPUT_DIR="data/test-responses"

# Test wallet addresses
SOLANA_WALLET="vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg"
SOLANA_MINT="So11111111111111111111111111111111111111112"  # Wrapped SOL
POLYMARKET_USER="0x1234567890123456789012345678901234567890"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASS=0
FAIL=0

test_endpoint() {
    local name=$1
    local method=$2
    local endpoint=$3
    local filename=$4
    local body=$5
    
    echo -n "Testing: $name... "
    
    if [ "$method" == "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" -H "X-API-Key: $API_KEY" "$BASE_URL$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" -X POST -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" -d "$body" "$BASE_URL$endpoint")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body_response=$(echo "$response" | sed '$d')
    
    # Save response
    echo "$body_response" | jq '.' > "$OUTPUT_DIR/$filename" 2>/dev/null || echo "$body_response" > "$OUTPUT_DIR/$filename"
    
    # Check success
    success=$(echo "$body_response" | jq -r '.success' 2>/dev/null)
    
    if [ "$http_code" == "200" ] || [ "$http_code" == "201" ]; then
        if [ "$success" == "true" ]; then
            echo -e "${GREEN}✓ PASS${NC} (HTTP $http_code)"
            ((PASS++))
        else
            echo -e "${YELLOW}⚠ WARN${NC} (HTTP $http_code, success=$success)"
            ((PASS++))
        fi
    else
        echo -e "${RED}✗ FAIL${NC} (HTTP $http_code)"
        ((FAIL++))
    fi
}

echo "========================================"
echo "API Endpoint Test Suite"
echo "========================================"
echo "Base URL: $BASE_URL"
echo "Output: $OUTPUT_DIR"
echo "========================================"
echo ""

# ==========================================
# POLYMARKET ENDPOINTS
# ==========================================
echo "--- POLYMARKET ENDPOINTS ---"

test_endpoint "Markets List" "GET" "/v1/polymarket/markets?limit=5" "pm-01-markets.json"
test_endpoint "Categories" "GET" "/v1/polymarket/categories" "pm-02-categories.json"
test_endpoint "Trending" "GET" "/v1/polymarket/trending" "pm-03-trending.json"
test_endpoint "Search" "GET" "/v1/polymarket/search?q=trump&limit=5" "pm-04-search.json"
test_endpoint "Leaderboard" "GET" "/v1/polymarket/leaderboard?limit=10" "pm-05-leaderboard.json"
test_endpoint "Stats" "GET" "/v1/polymarket/stats" "pm-06-stats.json"
test_endpoint "Events" "GET" "/v1/polymarket/events?limit=5" "pm-07-events.json"
test_endpoint "Featured Markets" "GET" "/v1/polymarket/markets/featured" "pm-08-featured.json"

# Get a market ID from the first response for dependent tests
MARKET_ID=$(jq -r '.data[0].id // empty' "$OUTPUT_DIR/pm-01-markets.json" 2>/dev/null)
if [ -n "$MARKET_ID" ]; then
    test_endpoint "Market Detail" "GET" "/v1/polymarket/markets/$MARKET_ID" "pm-09-market-detail.json"
    test_endpoint "Market Price" "GET" "/v1/polymarket/markets/$MARKET_ID/price" "pm-10-market-price.json"
    test_endpoint "Price History" "GET" "/v1/polymarket/markets/$MARKET_ID/price/history?limit=10" "pm-11-price-history.json"
    test_endpoint "Orderbook" "GET" "/v1/polymarket/markets/$MARKET_ID/orderbook" "pm-12-orderbook.json"
    test_endpoint "Market Trades" "GET" "/v1/polymarket/markets/$MARKET_ID/trades?limit=10" "pm-13-market-trades.json"
    test_endpoint "Market Positions" "GET" "/v1/polymarket/markets/$MARKET_ID/positions?limit=10" "pm-14-market-positions.json"
    test_endpoint "Market Volume" "GET" "/v1/polymarket/markets/$MARKET_ID/volume" "pm-15-market-volume.json"
fi

# User endpoints
test_endpoint "User Profile" "GET" "/v1/polymarket/users/$POLYMARKET_USER" "pm-16-user-profile.json"
test_endpoint "User Positions" "GET" "/v1/polymarket/users/$POLYMARKET_USER/positions" "pm-17-user-positions.json"
test_endpoint "User Trades" "GET" "/v1/polymarket/users/$POLYMARKET_USER/trades?limit=10" "pm-18-user-trades.json"
test_endpoint "User Orders" "GET" "/v1/polymarket/users/$POLYMARKET_USER/orders" "pm-19-user-orders.json"
test_endpoint "User PnL" "GET" "/v1/polymarket/users/$POLYMARKET_USER/pnl" "pm-20-user-pnl.json"
test_endpoint "User Activity" "GET" "/v1/polymarket/users/$POLYMARKET_USER/activity?limit=10" "pm-21-user-activity.json"

echo ""
# ==========================================
# SOLANA ENDPOINTS
# ==========================================
echo "--- SOLANA ENDPOINTS ---"

# Account endpoints
test_endpoint "Account Info" "GET" "/v1/solana/account/$SOLANA_WALLET" "sol-01-account.json"
test_endpoint "Account Balance" "GET" "/v1/solana/account/$SOLANA_WALLET/balance" "sol-02-balance.json"
test_endpoint "Account Tokens" "GET" "/v1/solana/account/$SOLANA_WALLET/tokens" "sol-03-tokens.json"
test_endpoint "Account NFTs" "GET" "/v1/solana/account/$SOLANA_WALLET/nfts?limit=5" "sol-04-nfts.json"

# Token endpoints
test_endpoint "Token Metadata" "GET" "/v1/solana/token/$SOLANA_MINT" "sol-05-token-metadata.json"
test_endpoint "Token Price" "GET" "/v1/solana/token/$SOLANA_MINT/price" "sol-06-token-price.json"
test_endpoint "Batch Prices" "GET" "/v1/solana/tokens/prices?mints=$SOLANA_MINT" "sol-07-batch-prices.json"

# Bitquery endpoints (will fail if not configured)
test_endpoint "Balance Updates" "GET" "/v1/solana/balance-updates?limit=5" "sol-08-balance-updates.json"
test_endpoint "All Balances" "GET" "/v1/solana/balances/$SOLANA_WALLET" "sol-09-all-balances.json"
test_endpoint "Balance History" "GET" "/v1/solana/balance-history/$SOLANA_WALLET?limit=5" "sol-10-balance-history.json"
test_endpoint "Transfers" "GET" "/v1/solana/transfers/$SOLANA_WALLET?limit=5" "sol-11-transfers.json"
test_endpoint "Top Holders" "GET" "/v1/solana/token/$SOLANA_MINT/top-holders?limit=10" "sol-12-top-holders.json"
test_endpoint "Token OHLCV" "GET" "/v1/solana/token/$SOLANA_MINT/ohlcv?limit=10" "sol-13-ohlcv.json"

# DEX Trade endpoints
test_endpoint "Token Trades" "GET" "/v1/solana/trades/token/$SOLANA_MINT?limit=5" "sol-14-token-trades.json"
test_endpoint "Pump Trades" "GET" "/v1/solana/trades/pump?limit=5" "sol-15-pump-trades.json"
test_endpoint "Raydium Trades" "GET" "/v1/solana/trades/raydium?limit=5" "sol-16-raydium-trades.json"
test_endpoint "Orca Trades" "GET" "/v1/solana/trades/orca?limit=5" "sol-17-orca-trades.json"
test_endpoint "Jupiter Trades" "GET" "/v1/solana/trades/jupiter?limit=5" "sol-18-jupiter-trades.json"
test_endpoint "DEX Protocol" "GET" "/v1/solana/trades/dex/pump?limit=5" "sol-19-dex-protocol.json"

echo ""
echo "========================================"
echo "TEST RESULTS"
echo "========================================"
echo -e "${GREEN}PASSED: $PASS${NC}"
echo -e "${RED}FAILED: $FAIL${NC}"
echo "Total: $((PASS + FAIL))"
echo ""
echo "Responses saved to: $OUTPUT_DIR/"
ls -la "$OUTPUT_DIR/"

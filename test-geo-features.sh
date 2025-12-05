#!/bin/bash

# Test script for Best-in-Market GEO Features
# Usage: ./test-geo-features.sh [WORKSPACE_ID] [JWT_TOKEN]

set -e

API_URL="${API_URL:-http://localhost:8080}"
WORKSPACE_ID="${1:-}"
JWT_TOKEN="${2:-}"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🧪 Testing Best-in-Market GEO Features${NC}\n"

# Check if API is running
echo "Checking API health..."
HEALTH=$(curl -s "${API_URL}/healthz" || echo "failed")
if [ "$HEALTH" = "failed" ]; then
  echo -e "${RED}❌ API server is not running at ${API_URL}${NC}"
  echo "Please start the API server first: pnpm --filter @apps/api dev"
  exit 1
fi
echo -e "${GREEN}✅ API server is running${NC}\n"

# Check workspace ID
if [ -z "$WORKSPACE_ID" ]; then
  echo -e "${YELLOW}⚠️  No workspace ID provided${NC}"
  echo "Usage: ./test-geo-features.sh WORKSPACE_ID [JWT_TOKEN]"
  echo "Or set environment variables:"
  echo "  export WORKSPACE_ID=your-workspace-id"
  echo "  export JWT_TOKEN=your-jwt-token"
  exit 1
fi

# Prepare auth header
AUTH_HEADER=""
if [ -n "$JWT_TOKEN" ]; then
  AUTH_HEADER="-H 'Authorization: Bearer $JWT_TOKEN'"
fi

echo -e "${YELLOW}Testing with Workspace ID: ${WORKSPACE_ID}${NC}\n"

# Test 1: E-E-A-T Scoring
echo -e "${YELLOW}1. Testing E-E-A-T Scoring...${NC}"
EEAT_RESPONSE=$(curl -s -X GET "${API_URL}/v1/geo/eeat?workspaceId=${WORKSPACE_ID}" \
  -H "Content-Type: application/json" \
  ${AUTH_HEADER})

if echo "$EEAT_RESPONSE" | grep -q '"ok":true'; then
  echo -e "${GREEN}✅ E-E-A-T endpoint working${NC}"
  echo "$EEAT_RESPONSE" | jq '.data | {experience, expertise, authoritativeness, trustworthiness, overallScore, level}' 2>/dev/null || echo "$EEAT_RESPONSE"
else
  echo -e "${RED}❌ E-E-A-T endpoint failed${NC}"
  echo "$EEAT_RESPONSE"
fi
echo ""

# Test 2: Fact-Level Consensus
echo -e "${YELLOW}2. Testing Fact-Level Consensus...${NC}"
CONSENSUS_RESPONSE=$(curl -s -X GET "${API_URL}/v1/geo/evidence/consensus?workspaceId=${WORKSPACE_ID}" \
  -H "Content-Type: application/json" \
  ${AUTH_HEADER})

if echo "$CONSENSUS_RESPONSE" | grep -q '"ok":true'; then
  echo -e "${GREEN}✅ Fact Consensus endpoint working${NC}"
  FACT_COUNT=$(echo "$CONSENSUS_RESPONSE" | jq '.data | length' 2>/dev/null || echo "0")
  echo "Found ${FACT_COUNT} fact types"
  echo "$CONSENSUS_RESPONSE" | jq '.data[] | {factType, consensus, agreementCount, contradictionCount}' 2>/dev/null || echo "$CONSENSUS_RESPONSE"
else
  echo -e "${RED}❌ Fact Consensus endpoint failed${NC}"
  echo "$CONSENSUS_RESPONSE"
fi
echo ""

# Test 3: Dashboard Overview
echo -e "${YELLOW}3. Testing Dashboard Overview...${NC}"
DASHBOARD_RESPONSE=$(curl -s -X GET "${API_URL}/v1/geo/dashboard/overview?workspaceId=${WORKSPACE_ID}" \
  -H "Content-Type: application/json" \
  ${AUTH_HEADER})

if echo "$DASHBOARD_RESPONSE" | grep -q '"ok":true'; then
  echo -e "${GREEN}✅ Dashboard Overview endpoint working${NC}"
  echo "$DASHBOARD_RESPONSE" | jq '.data | {maturityScore: .maturityScore.overallScore, hasEEAT: (.eeatScore != null), recommendationCount: (.recommendations | length), engineCount: (.engineComparison | length)}' 2>/dev/null || echo "$DASHBOARD_RESPONSE"
else
  echo -e "${RED}❌ Dashboard Overview endpoint failed${NC}"
  echo "$DASHBOARD_RESPONSE"
fi
echo ""

# Test 4: Dashboard Maturity
echo -e "${YELLOW}4. Testing Dashboard Maturity...${NC}"
MATURITY_RESPONSE=$(curl -s -X GET "${API_URL}/v1/geo/dashboard/maturity?workspaceId=${WORKSPACE_ID}" \
  -H "Content-Type: application/json" \
  ${AUTH_HEADER})

if echo "$MATURITY_RESPONSE" | grep -q '"ok":true'; then
  echo -e "${GREEN}✅ Dashboard Maturity endpoint working${NC}"
  echo "$MATURITY_RESPONSE" | jq '.data.current | {overallScore, maturityLevel, entityStrength, citationDepth}' 2>/dev/null || echo "$MATURITY_RESPONSE"
else
  echo -e "${RED}❌ Dashboard Maturity endpoint failed${NC}"
  echo "$MATURITY_RESPONSE"
fi
echo ""

# Test 5: Dashboard Recommendations
echo -e "${YELLOW}5. Testing Dashboard Recommendations...${NC}"
RECS_RESPONSE=$(curl -s -X GET "${API_URL}/v1/geo/dashboard/recommendations?workspaceId=${WORKSPACE_ID}" \
  -H "Content-Type: application/json" \
  ${AUTH_HEADER})

if echo "$RECS_RESPONSE" | grep -q '"ok":true'; then
  echo -e "${GREEN}✅ Dashboard Recommendations endpoint working${NC}"
  REC_COUNT=$(echo "$RECS_RESPONSE" | jq '.data | length' 2>/dev/null || echo "0")
  echo "Found ${REC_COUNT} recommendations"
else
  echo -e "${RED}❌ Dashboard Recommendations endpoint failed${NC}"
  echo "$RECS_RESPONSE"
fi
echo ""

# Test 6: Engine Comparison
echo -e "${YELLOW}6. Testing Engine Comparison...${NC}"
ENGINE_RESPONSE=$(curl -s -X GET "${API_URL}/v1/geo/dashboard/engines/comparison?workspaceId=${WORKSPACE_ID}" \
  -H "Content-Type: application/json" \
  ${AUTH_HEADER})

if echo "$ENGINE_RESPONSE" | grep -q '"ok":true'; then
  echo -e "${GREEN}✅ Engine Comparison endpoint working${NC}"
  ENGINE_COUNT=$(echo "$ENGINE_RESPONSE" | jq '.data | length' 2>/dev/null || echo "0")
  echo "Comparing ${ENGINE_COUNT} engines"
  echo "$ENGINE_RESPONSE" | jq '.data[] | {engine, visibilityScore, mentionCount}' 2>/dev/null || echo "$ENGINE_RESPONSE"
else
  echo -e "${RED}❌ Engine Comparison endpoint failed${NC}"
  echo "$ENGINE_RESPONSE"
fi
echo ""

# Test 7: Progress History
echo -e "${YELLOW}7. Testing Progress History...${NC}"
PROGRESS_RESPONSE=$(curl -s -X GET "${API_URL}/v1/geo/dashboard/progress?workspaceId=${WORKSPACE_ID}&days=30" \
  -H "Content-Type: application/json" \
  ${AUTH_HEADER})

if echo "$PROGRESS_RESPONSE" | grep -q '"ok":true'; then
  echo -e "${GREEN}✅ Progress History endpoint working${NC}"
  PROGRESS_COUNT=$(echo "$PROGRESS_RESPONSE" | jq '.data | length' 2>/dev/null || echo "0")
  echo "Found ${PROGRESS_COUNT} progress points"
else
  echo -e "${RED}❌ Progress History endpoint failed${NC}"
  echo "$PROGRESS_RESPONSE"
fi
echo ""

# Summary
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Testing Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "For detailed responses, use Swagger UI: ${API_URL}/v1/docs"















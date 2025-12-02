#!/bin/bash

# Test GEO endpoints with your workspace ID
WORKSPACE_ID="cmhfexkim0000l9bpar4kr7at"
API_BASE="http://localhost:8080/v1"

echo "Testing GEO Features for Workspace: $WORKSPACE_ID"
echo "=================================================="
echo ""

echo "1. Health Check"
curl -s "$API_BASE/../healthz" | jq .
echo -e "\n"

echo "2. E-E-A-T Score"
curl -s "$API_BASE/geo/eeat?workspaceId=$WORKSPACE_ID" | jq .
echo -e "\n"

echo "3. Dashboard Overview"
curl -s "$API_BASE/geo/dashboard/overview?workspaceId=$WORKSPACE_ID" | jq .
echo -e "\n"

echo "4. Fact-Level Consensus"
curl -s "$API_BASE/geo/evidence/consensus?workspaceId=$WORKSPACE_ID" | jq .
echo -e "\n"

echo "5. Dashboard Maturity"
curl -s "$API_BASE/geo/dashboard/maturity?workspaceId=$WORKSPACE_ID" | jq .
echo -e "\n"

echo "6. Dashboard Recommendations"
curl -s "$API_BASE/geo/dashboard/recommendations?workspaceId=$WORKSPACE_ID&limit=5" | jq .
echo -e "\n"

echo "7. Dashboard Fact Consensus (Address)"
curl -s "$API_BASE/geo/dashboard/fact-consensus?workspaceId=$WORKSPACE_ID&factType=address" | jq .
echo -e "\n"

echo "8. Evidence Graph"
curl -s "$API_BASE/geo/evidence/graph?workspaceId=$WORKSPACE_ID" | jq .
echo -e "\n"

echo "Testing Complete!"













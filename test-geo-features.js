#!/usr/bin/env node

/**
 * Test script for Best-in-Market GEO Features
 * Usage: node test-geo-features.js [WORKSPACE_ID]
 */

const http = require('http');

const API_URL = process.env.API_URL || 'http://localhost:8080';
const WORKSPACE_ID = process.argv[2] || process.env.WORKSPACE_ID;

// Colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function makeRequest(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const url = `${API_URL}${path}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

async function testEndpoint(name, path, extractor = null) {
  try {
    log('yellow', `Testing ${name}...`);
    const result = await makeRequest(path);
    
    if (result.status === 200 && result.data.ok !== false) {
      log('green', `✅ ${name} - SUCCESS`);
      if (extractor) {
        const extracted = extractor(result.data);
        console.log(JSON.stringify(extracted, null, 2));
      }
      return true;
    } else {
      log('red', `❌ ${name} - FAILED (Status: ${result.status})`);
      console.log(JSON.stringify(result.data, null, 2));
      return false;
    }
  } catch (error) {
    log('red', `❌ ${name} - ERROR: ${error.message}`);
    return false;
  }
}

async function main() {
  log('blue', '🧪 Testing Best-in-Market GEO Features\n');

  // Check API health
  try {
    const health = await makeRequest('/healthz');
    if (health.status === 200) {
      log('green', '✅ API server is running\n');
    } else {
      log('red', '❌ API server is not healthy\n');
      process.exit(1);
    }
  } catch (error) {
    log('red', `❌ Cannot connect to API at ${API_URL}`);
    log('yellow', 'Please start the API server: pnpm --filter @apps/api dev\n');
    process.exit(1);
  }

  if (!WORKSPACE_ID) {
    log('yellow', '⚠️  No workspace ID provided');
    log('yellow', 'Usage: node test-geo-features.js WORKSPACE_ID');
    log('yellow', 'Or set: export WORKSPACE_ID=your-workspace-id\n');
    process.exit(1);
  }

  log('yellow', `Testing with Workspace ID: ${WORKSPACE_ID}\n`);

  const results = [];

  // Test 1: E-E-A-T
  results.push(await testEndpoint(
    'E-E-A-T Scoring',
    `/v1/geo/eeat?workspaceId=${WORKSPACE_ID}`,
    (data) => ({
      experience: data.data?.experience,
      expertise: data.data?.expertise,
      authoritativeness: data.data?.authoritativeness,
      trustworthiness: data.data?.trustworthiness,
      overallScore: data.data?.overallScore,
      level: data.data?.level,
    })
  ));
  console.log('');

  // Test 2: Fact Consensus
  results.push(await testEndpoint(
    'Fact-Level Consensus',
    `/v1/geo/evidence/consensus?workspaceId=${WORKSPACE_ID}`,
    (data) => ({
      factTypeCount: data.data?.length || 0,
      factTypes: data.data?.map(f => ({
        type: f.factType,
        consensus: f.consensus,
        agreements: f.agreementCount,
        contradictions: f.contradictionCount,
      })) || [],
    })
  ));
  console.log('');

  // Test 3: Dashboard Overview
  results.push(await testEndpoint(
    'Dashboard Overview',
    `/v1/geo/dashboard/overview?workspaceId=${WORKSPACE_ID}`,
    (data) => ({
      maturityScore: data.data?.maturityScore?.overallScore,
      hasEEAT: !!data.data?.eeatScore,
      recommendationCount: data.data?.recommendations?.length || 0,
      engineCount: data.data?.engineComparison?.length || 0,
      progressPoints: data.data?.progress?.length || 0,
    })
  ));
  console.log('');

  // Test 4: Dashboard Maturity
  results.push(await testEndpoint(
    'Dashboard Maturity',
    `/v1/geo/dashboard/maturity?workspaceId=${WORKSPACE_ID}`,
    (data) => ({
      currentScore: data.data?.current?.overallScore,
      maturityLevel: data.data?.current?.maturityLevel,
      trends: data.data?.trends,
    })
  ));
  console.log('');

  // Test 5: Dashboard Recommendations
  results.push(await testEndpoint(
    'Dashboard Recommendations',
    `/v1/geo/dashboard/recommendations?workspaceId=${WORKSPACE_ID}`,
    (data) => ({
      count: data.data?.length || 0,
      priorities: data.data?.map(r => r.priority) || [],
    })
  ));
  console.log('');

  // Test 6: Engine Comparison
  results.push(await testEndpoint(
    'Engine Comparison',
    `/v1/geo/dashboard/engines/comparison?workspaceId=${WORKSPACE_ID}`,
    (data) => ({
      engineCount: data.data?.length || 0,
      engines: data.data?.map(e => ({
        engine: e.engine,
        visibilityScore: e.visibilityScore,
        mentionCount: e.mentionCount,
      })) || [],
    })
  ));
  console.log('');

  // Summary
  const passed = results.filter(r => r).length;
  const total = results.length;

  log('blue', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(passed === total ? 'green' : 'yellow', `Results: ${passed}/${total} tests passed`);
  log('blue', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (passed < total) {
    log('yellow', 'For detailed error messages, check the output above.');
    log('yellow', `Also try Swagger UI: ${API_URL}/v1/docs`);
  }
}

main().catch(console.error);













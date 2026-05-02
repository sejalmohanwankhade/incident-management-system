#!/usr/bin/env node
/**
 * mock-failure.js
 * Simulates a cascading failure: RDBMS outage → MCP Host failure → API errors
 *
 * Usage:
 *   node scripts/mock-failure.js [--url http://localhost:3001] [--burst]
 */

const http = require('http');
const https = require('https');

const args = process.argv.slice(2);
const BASE_URL = args.includes('--url')
  ? args[args.indexOf('--url') + 1]
  : 'http://localhost:3001';
const BURST_MODE = args.includes('--burst');

const SCENARIOS = [
  {
    name: '1. RDBMS Primary Outage',
    delay: 0,
    signals: [
      { componentId: 'POSTGRES_PRIMARY', componentType: 'RDBMS', errorCode: 'CONN_REFUSED', message: 'Primary PostgreSQL node connection refused', latencyMs: null },
      { componentId: 'POSTGRES_PRIMARY', componentType: 'RDBMS', errorCode: 'CONN_REFUSED', message: 'Primary PostgreSQL node connection refused', latencyMs: null },
      { componentId: 'POSTGRES_PRIMARY', componentType: 'RDBMS', errorCode: 'QUERY_TIMEOUT', message: 'Write query timed out: INSERT INTO events', latencyMs: 30000 },
      { componentId: 'POSTGRES_REPLICA', componentType: 'RDBMS', errorCode: 'REPL_LAG', message: 'Replica lag exceeds 10s — reads degraded', latencyMs: 12000 },
    ],
  },
  {
    name: '2. MCP Host Cascade',
    delay: 2000,
    signals: [
      { componentId: 'MCP_HOST_EU_1', componentType: 'MCP_HOST', errorCode: 'HOST_TIMEOUT', message: 'MCP host eu-1 health check failed', latencyMs: null },
      { componentId: 'MCP_HOST_EU_2', componentType: 'MCP_HOST', errorCode: 'HOST_TIMEOUT', message: 'MCP host eu-2 health check failed (failover attempt)', latencyMs: null },
    ],
  },
  {
    name: '3. Cache Miss Storm',
    delay: 3000,
    signals: [
      { componentId: 'REDIS_CLUSTER_01', componentType: 'CACHE', errorCode: 'CACHE_MISS_STORM', message: 'Cache miss rate > 95% — thundering herd detected', latencyMs: 2000 },
      { componentId: 'REDIS_CLUSTER_01', componentType: 'CACHE', errorCode: 'EVICTION_HIGH', message: 'Key eviction rate spike: 50k/sec', latencyMs: null },
    ],
  },
  {
    name: '4. API Gateway Latency',
    delay: 4000,
    signals: [
      { componentId: 'API_GATEWAY_PROD', componentType: 'API', errorCode: 'HTTP_504', message: 'Gateway timeout: /api/v2/orders', latencyMs: 15000 },
      { componentId: 'API_GATEWAY_PROD', componentType: 'API', errorCode: 'HTTP_503', message: 'Service unavailable: /api/v2/users', latencyMs: 8000 },
      { componentId: 'API_GATEWAY_PROD', componentType: 'API', errorCode: 'HTTP_500', message: 'Internal error: database connection pool exhausted', latencyMs: 500 },
    ],
  },
  {
    name: '5. Queue Backlog',
    delay: 5000,
    signals: [
      { componentId: 'KAFKA_ORDERS_TOPIC', componentType: 'QUEUE', errorCode: 'LAG_CRITICAL', message: 'Consumer group lag: 250,000 messages behind', latencyMs: null },
      { componentId: 'KAFKA_EVENTS_TOPIC', componentType: 'QUEUE', errorCode: 'LAG_HIGH', message: 'Consumer group lag: 75,000 messages behind', latencyMs: null },
    ],
  },
];

// Burst: send 100+ signals for same component to trigger debounce
const BURST_SCENARIO = {
  name: 'BURST — Debounce Test (100+ signals for CACHE_CLUSTER_01)',
  signals: Array.from({ length: 110 }, (_, i) => ({
    componentId: 'CACHE_CLUSTER_01',
    componentType: 'CACHE',
    errorCode: 'BURST_TEST',
    message: `Burst signal ${i + 1}: cache node unresponsive`,
    latencyMs: Math.floor(Math.random() * 5000),
  })),
};

async function post(path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const lib = url.protocol === 'https:' ? https : http;
    const data = JSON.stringify(body);
    const req = lib.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log(`\n🚨 IMS Mock Failure Simulation`);
  console.log(`   Target: ${BASE_URL}`);
  console.log(`   Mode:   ${BURST_MODE ? 'BURST' : 'CASCADING FAILURE'}\n`);

  if (BURST_MODE) {
    console.log(`📦 Sending burst: ${BURST_SCENARIO.signals.length} signals...`);
    const res = await post('/api/signals/batch', BURST_SCENARIO.signals);
    console.log(`   → ${res.status} — accepted ${res.body.count} signals`);
    console.log(`   ✅ Debounce should create 1 work item for CACHE_CLUSTER_01\n`);
    return;
  }

  for (const scenario of SCENARIOS) {
    await sleep(scenario.delay);
    console.log(`📡 ${scenario.name}`);
    try {
      const res = await post('/api/signals/batch', scenario.signals);
      console.log(`   → ${res.status} — accepted ${res.body.count} signal(s)`);
    } catch (err) {
      console.error(`   ✗ Error: ${err.message}`);
    }
  }

  console.log('\n✅ Simulation complete. Check the dashboard at http://localhost:3000\n');
}

run().catch(err => { console.error('Fatal:', err.message); process.exit(1); });

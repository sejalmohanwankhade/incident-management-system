const Redis = require('ioredis');
const logger = require('../observability/logger');

let client;

function getRedis() {
  if (!client) {
    client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      retryStrategy: (times) => {
        const delay = Math.min(times * 100, 3000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    client.on('error', (err) => logger.error('Redis error', { error: err.message }));
    client.on('connect', () => logger.info('Redis connected'));
  }
  return client;
}

// Dashboard state keys
const DASHBOARD_KEY = 'ims:dashboard:active';
const THROUGHPUT_KEY = 'ims:metrics:throughput';

/**
 * Cache the full active work items list for fast dashboard reads.
 * TTL: 10 seconds (refreshed on every mutation).
 */
async function setDashboardCache(workItems) {
  const redis = getRedis();
  await redis.setex(DASHBOARD_KEY, 10, JSON.stringify(workItems));
}

async function getDashboardCache() {
  const redis = getRedis();
  const data = await redis.get(DASHBOARD_KEY);
  return data ? JSON.parse(data) : null;
}

async function invalidateDashboardCache() {
  const redis = getRedis();
  await redis.del(DASHBOARD_KEY);
}

/**
 * Increment the per-second signal counter for throughput tracking.
 * We bucket by second (unix timestamp).
 */
async function recordSignalThroughput(count = 1) {
  const redis = getRedis();
  const bucket = Math.floor(Date.now() / 1000);
  const key = `${THROUGHPUT_KEY}:${bucket}`;
  await redis.incrby(key, count);
  await redis.expire(key, 120); // keep for 2 minutes
}

/**
 * Get throughput for the last N seconds.
 */
async function getThroughputStats(windowSeconds = 60) {
  const redis = getRedis();
  const now = Math.floor(Date.now() / 1000);
  const keys = [];
  for (let i = 0; i < windowSeconds; i++) {
    keys.push(`${THROUGHPUT_KEY}:${now - i}`);
  }
  const values = await redis.mget(...keys);
  const total = values.reduce((sum, v) => sum + (parseInt(v) || 0), 0);
  return { total, windowSeconds, avg: (total / windowSeconds).toFixed(2) };
}

/**
 * Store timeseries aggregation: signals per component per minute bucket.
 */
async function recordComponentAggregation(componentId, severity) {
  const redis = getRedis();
  const bucket = Math.floor(Date.now() / 60000); // minute bucket
  const key = `ims:ts:${componentId}:${bucket}`;
  await redis.hincrby(key, severity, 1);
  await redis.expire(key, 86400); // 24 hours
}

/**
 * Get aggregation for a component over the last N minutes.
 */
async function getComponentTimeseries(componentId, minutes = 60) {
  const redis = getRedis();
  const now = Math.floor(Date.now() / 60000);
  const pipeline = redis.pipeline();
  for (let i = 0; i < minutes; i++) {
    pipeline.hgetall(`ims:ts:${componentId}:${now - i}`);
  }
  const results = await pipeline.exec();
  return results.map(([, data], idx) => ({
    bucket: new Date((now - idx) * 60000).toISOString(),
    counts: data || {},
  })).reverse();
}

module.exports = {
  getRedis,
  setDashboardCache,
  getDashboardCache,
  invalidateDashboardCache,
  recordSignalThroughput,
  getThroughputStats,
  recordComponentAggregation,
  getComponentTimeseries,
};

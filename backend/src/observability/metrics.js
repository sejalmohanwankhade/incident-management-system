const { getThroughputStats } = require('../storage/redis');
const { pool } = require('../storage/postgres');
const { getRedis } = require('../storage/redis');
const logger = require('./logger');
const mongoose = require('mongoose');
const processor = require('../ingestion/signalProcessor');

let metricsInterval;

function startMetricsPrinter() {
  metricsInterval = setInterval(async () => {
    try {
      const throughput = await getThroughputStats(5);
      const bufferStats = processor.stats();
      logger.info('=== IMS Throughput Metrics ===', {
        signals_last_5s: throughput.total,
        avg_per_sec: throughput.avg,
        buffer_size: bufferStats.buffer.size,
        buffer_utilization: bufferStats.buffer.utilization,
        total_processed: bufferStats.processed,
        total_errors: bufferStats.errors,
        dropped_signals: bufferStats.buffer.dropped,
      });
    } catch (err) {
      logger.error('Metrics print error', { error: err.message });
    }
  }, 5000);
  metricsInterval.unref();
}

function stopMetricsPrinter() {
  clearInterval(metricsInterval);
}

async function getHealthStatus() {
  const checks = {};

  // PostgreSQL
  try {
    await pool.query('SELECT 1');
    checks.postgres = { status: 'ok' };
  } catch (err) {
    checks.postgres = { status: 'error', message: err.message };
  }

  // MongoDB
  try {
    const state = mongoose.connection.readyState;
    checks.mongo = { status: state === 1 ? 'ok' : 'degraded', readyState: state };
  } catch (err) {
    checks.mongo = { status: 'error', message: err.message };
  }

  // Redis
  try {
    const redis = getRedis();
    await redis.ping();
    checks.redis = { status: 'ok' };
  } catch (err) {
    checks.redis = { status: 'error', message: err.message };
  }

  // Buffer
  const bufStats = processor.stats();
  checks.buffer = {
    status: bufStats.buffer.utilization < '90%' ? 'ok' : 'warning',
    ...bufStats.buffer,
  };

  const allOk = Object.values(checks).every(c => c.status === 'ok' || c.status === 'degraded');
  return {
    status: allOk ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    checks,
  };
}

module.exports = { startMetricsPrinter, stopMetricsPrinter, getHealthStatus };

const { Pool } = require('pg');
const logger = require('../observability/logger');

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT) || 5432,
  database: process.env.POSTGRES_DB || 'ims_db',
  user: process.env.POSTGRES_USER || 'ims_user',
  password: process.env.POSTGRES_PASSWORD || 'ims_secret',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL client error', { error: err.message });
});

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS work_items (
  id UUID PRIMARY KEY,
  component_id VARCHAR(255) NOT NULL,
  severity VARCHAR(10) NOT NULL CHECK (severity IN ('P0','P1','P2','P3')),
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN','INVESTIGATING','RESOLVED','CLOSED')),
  title TEXT NOT NULL,
  signal_count INTEGER DEFAULT 1,
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  mttr_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rca_records (
  id UUID PRIMARY KEY,
  work_item_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  incident_start TIMESTAMPTZ NOT NULL,
  incident_end TIMESTAMPTZ NOT NULL,
  root_cause_category VARCHAR(100) NOT NULL,
  fix_applied TEXT NOT NULL,
  prevention_steps TEXT NOT NULL,
  submitted_by VARCHAR(255) DEFAULT 'system',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(work_item_id)
);

CREATE INDEX IF NOT EXISTS idx_work_items_status ON work_items(status);
CREATE INDEX IF NOT EXISTS idx_work_items_severity ON work_items(severity);
CREATE INDEX IF NOT EXISTS idx_work_items_component ON work_items(component_id);
CREATE INDEX IF NOT EXISTS idx_rca_work_item ON rca_records(work_item_id);
`;

async function initPostgres(retries = 10, delayMs = 3000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const client = await pool.connect();
      await client.query(SCHEMA_SQL);
      client.release();
      logger.info('PostgreSQL initialized and schema applied');
      return;
    } catch (err) {
      logger.warn(`PostgreSQL init attempt ${attempt}/${retries} failed: ${err.message}`);
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

/**
 * Execute a query with retry logic for transient errors.
 */
async function queryWithRetry(text, params = [], retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await pool.query(text, params);
    } catch (err) {
      const isTransient = err.code === '40001' || err.code === '57P01';
      if (!isTransient || i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 200 * (i + 1)));
    }
  }
}

/**
 * Run multiple queries in a single transaction.
 * @param {Function} txFn - async function receiving a client
 */
async function withTransaction(txFn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await txFn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, initPostgres, queryWithRetry, withTransaction };

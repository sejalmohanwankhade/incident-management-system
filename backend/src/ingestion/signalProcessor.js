const { v4: uuidv4 } = require('uuid');
const RingBuffer = require('./ringBuffer');
const Debouncer = require('./debouncer');
const {
  createWorkItem,
  linkSignalToWorkItem,
  persistSignal,
} = require('../workflow/workItemService');
const { recordSignalThroughput } = require('../storage/redis');
const logger = require('../observability/logger');

const BATCH_SIZE = 200;
const POLL_INTERVAL_MS = 50;

class SignalProcessor {
  constructor() {
    this.buffer = new RingBuffer(100000); // 100k capacity
    this.debouncer = new Debouncer({
      windowMs: parseInt(process.env.DEBOUNCE_WINDOW_MS) || 10000,
      threshold: parseInt(process.env.DEBOUNCE_THRESHOLD) || 100,
      onNewWorkItem: async (signal) => {
        return createWorkItem(signal);
      },
      onLinkSignal: async (workItemId, signalId) => {
        return linkSignalToWorkItem(workItemId, signalId);
      },
    });
    this._running = false;
    this._processedCount = 0;
    this._errorCount = 0;
  }

  /**
   * Enqueue a signal (non-blocking). Called from HTTP/WebSocket handlers.
   */
  enqueue(rawSignal) {
    const signal = this._normalize(rawSignal);
    this.buffer.push(signal);
    return signal.signalId;
  }

  /**
   * Start the async consumer loop.
   */
  start() {
    if (this._running) return;
    this._running = true;
    this._loop();
    logger.info('SignalProcessor started');
  }

  stop() {
    this._running = false;
    this.debouncer.destroy();
  }

  stats() {
    return {
      buffer: this.buffer.stats(),
      processed: this._processedCount,
      errors: this._errorCount,
    };
  }

  async _loop() {
    while (this._running) {
      if (this.buffer.isEmpty) {
        await _sleep(POLL_INTERVAL_MS);
        continue;
      }

      const batch = this.buffer.drain(BATCH_SIZE);
      await recordSignalThroughput(batch.length);

      // Process concurrently but bounded
      const chunks = _chunk(batch, 50);
      for (const chunk of chunks) {
        await Promise.allSettled(chunk.map(s => this._processOne(s)));
      }
    }
  }

  async _processOne(signal) {
    try {
      const { workItemId } = await this.debouncer.process(signal);
      await persistSignal(signal, workItemId);
      this._processedCount++;
    } catch (err) {
      this._errorCount++;
      logger.error('Signal processing error', { error: err.message, signalId: signal.signalId });
    }
  }

  _normalize(raw) {
    return {
      signalId: raw.signalId || uuidv4(),
      componentId: String(raw.componentId || 'UNKNOWN').toUpperCase(),
      componentType: _normalizeType(raw.componentType),
      errorCode: raw.errorCode || null,
      message: raw.message || 'No message provided',
      latencyMs: typeof raw.latencyMs === 'number' ? raw.latencyMs : null,
      severity: raw.severity || null, // will be set by alert strategy
      metadata: raw.metadata || {},
      receivedAt: new Date(),
    };
  }
}

function _normalizeType(t) {
  const map = {
    api: 'API',
    mcp_host: 'MCP_HOST',
    mcphost: 'MCP_HOST',
    cache: 'CACHE',
    queue: 'QUEUE',
    rdbms: 'RDBMS',
    postgres: 'RDBMS',
    mysql: 'RDBMS',
    nosql: 'NOSQL',
    mongo: 'NOSQL',
    mongodb: 'NOSQL',
  };
  return map[(t || '').toLowerCase()] || 'API';
}

function _sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function _chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// Singleton
const processor = new SignalProcessor();
module.exports = processor;

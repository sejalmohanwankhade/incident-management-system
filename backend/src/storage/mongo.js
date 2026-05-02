const mongoose = require('mongoose');
const logger = require('../observability/logger');

async function initMongo(retries = 10, delayMs = 3000) {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/ims_signals';
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      logger.info('MongoDB connected');
      return;
    } catch (err) {
      logger.warn(`MongoDB connect attempt ${attempt}/${retries}: ${err.message}`);
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

// Raw signal schema — the audit log / data lake
const signalSchema = new mongoose.Schema(
  {
    signalId: { type: String, required: true, index: true },
    workItemId: { type: String, index: true, default: null },
    componentId: { type: String, required: true, index: true },
    componentType: {
      type: String,
      enum: ['API', 'MCP_HOST', 'CACHE', 'QUEUE', 'RDBMS', 'NOSQL'],
      required: true,
    },
    errorCode: { type: String },
    message: { type: String, required: true },
    latencyMs: { type: Number, default: null },
    severity: { type: String, enum: ['P0', 'P1', 'P2', 'P3'], required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    receivedAt: { type: Date, default: Date.now, index: true },
  },
  { collection: 'signals', versionKey: false }
);

// TTL index: keep raw signals for 90 days
signalSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 7776000 });

const Signal = mongoose.model('Signal', signalSchema);

module.exports = { initMongo, Signal };

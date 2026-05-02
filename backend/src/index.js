require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { initPostgres } = require('./storage/postgres');
const { initMongo } = require('./storage/mongo');
const { initWebSocket } = require('./api/websocket');
const { startMetricsPrinter } = require('./observability/metrics');
const processor = require('./ingestion/signalProcessor');
const logger = require('./observability/logger');

const signalRoutes = require('./api/signalRoutes');
const workItemRoutes = require('./api/workItemRoutes');
const healthRoutes = require('./api/healthRoutes');

const app = express();
const server = http.createServer(app);

// ─── Security & Middleware ────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '5mb' }));

// Rate limiter on ingestion endpoint
const ingestLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many signals, please slow down' },
  keyGenerator: (req) => req.ip,
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/signals', ingestLimiter, signalRoutes);
app.use('/api/work-items', workItemRoutes);
app.use('/', healthRoutes);

app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function bootstrap() {
  const PORT = parseInt(process.env.PORT) || 3001;

  logger.info('Initializing storage layers...');
  await Promise.all([initPostgres(), initMongo()]);

  // Start async signal consumer
  processor.start();

  // WebSocket for live updates
  initWebSocket(server);

  // Print throughput to console every 5 seconds
  startMetricsPrinter();

  server.listen(PORT, () => {
    logger.info(`IMS Backend running on port ${PORT}`);
    logger.info(`Health: http://localhost:${PORT}/health`);
    logger.info(`WebSocket: ws://localhost:${PORT}/ws`);
  });

  // Graceful shutdown
  const shutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    processor.stop();
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error('Bootstrap failed', { error: err.message, stack: err.stack });
  process.exit(1);
});

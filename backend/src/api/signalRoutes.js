const express = require('express');
const Joi = require('joi');
const processor = require('../ingestion/signalProcessor');
const router = express.Router();

const signalSchema = Joi.object({
  signalId: Joi.string().optional(),
  componentId: Joi.string().required(),
  componentType: Joi.string()
    .valid('API', 'MCP_HOST', 'CACHE', 'QUEUE', 'RDBMS', 'NOSQL',
           'api', 'mcp_host', 'cache', 'queue', 'rdbms', 'nosql',
           'postgres', 'mongo', 'mongodb')
    .required(),
  errorCode: Joi.string().optional().allow(null, ''),
  message: Joi.string().required(),
  latencyMs: Joi.number().optional().allow(null),
  severity: Joi.string().valid('P0', 'P1', 'P2', 'P3').optional(),
  metadata: Joi.object().optional(),
});

const batchSchema = Joi.array().items(signalSchema).min(1).max(1000);

// POST /api/signals — single signal ingestion
router.post('/', (req, res) => {
  const { error, value } = signalSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }
  const signalId = processor.enqueue(value);
  res.status(202).json({ accepted: true, signalId });
});

// POST /api/signals/batch — bulk ingestion (up to 1000)
router.post('/batch', (req, res) => {
  const { error, value } = batchSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }
  const ids = value.map(s => processor.enqueue(s));
  res.status(202).json({ accepted: true, count: ids.length, signalIds: ids });
});

// GET /api/signals/processor-stats — internal buffer stats
router.get('/processor-stats', (req, res) => {
  res.json(processor.stats());
});

module.exports = router;

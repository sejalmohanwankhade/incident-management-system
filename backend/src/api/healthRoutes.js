const express = require('express');
const { getHealthStatus } = require('../observability/metrics');
const { getThroughputStats, getComponentTimeseries } = require('../storage/redis');
const router = express.Router();

router.get('/health', async (req, res) => {
  try {
    const health = await getHealthStatus();
    res.status(health.status === 'healthy' ? 200 : 503).json(health);
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: err.message });
  }
});

router.get('/metrics', async (req, res) => {
  try {
    const [throughput60, throughput5] = await Promise.all([
      getThroughputStats(60),
      getThroughputStats(5),
    ]);
    res.json({ throughput_60s: throughput60, throughput_5s: throughput5 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/metrics/timeseries/:componentId', async (req, res) => {
  try {
    const minutes = parseInt(req.query.minutes) || 60;
    const data = await getComponentTimeseries(req.params.componentId, minutes);
    res.json({ componentId: req.params.componentId, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

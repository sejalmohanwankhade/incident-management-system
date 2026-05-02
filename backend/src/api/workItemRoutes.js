const express = require('express');
const Joi = require('joi');
const {
  getActiveWorkItems,
  getWorkItemById,
  getAllWorkItems,
  transitionWorkItem,
  submitRCA,
} = require('../workflow/workItemService');
const { getDashboardCache } = require('../storage/redis');
const { ROOT_CAUSE_CATEGORIES } = require('../workflow/stateMachine');
const router = express.Router();

const transitionSchema = Joi.object({
  status: Joi.string().valid('INVESTIGATING', 'RESOLVED', 'CLOSED').required(),
  rca: Joi.object({
    incident_start: Joi.string().isoDate().required(),
    incident_end: Joi.string().isoDate().required(),
    root_cause_category: Joi.string().valid(...ROOT_CAUSE_CATEGORIES).required(),
    fix_applied: Joi.string().min(10).required(),
    prevention_steps: Joi.string().min(10).required(),
    submitted_by: Joi.string().optional(),
  }).optional(),
});

const rcaSchema = Joi.object({
  incident_start: Joi.string().isoDate().required(),
  incident_end: Joi.string().isoDate().required(),
  root_cause_category: Joi.string().valid(...ROOT_CAUSE_CATEGORIES).required(),
  fix_applied: Joi.string().min(10).required(),
  prevention_steps: Joi.string().min(10).required(),
  submitted_by: Joi.string().optional(),
});

// GET /api/work-items — list all with optional ?status= filter and pagination
router.get('/', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const data = await getAllWorkItems(status, parseInt(page), parseInt(limit));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/work-items/active — dashboard feed (cached)
router.get('/active', async (req, res) => {
  try {
    const cached = await getDashboardCache();
    if (cached) return res.json({ items: cached, source: 'cache' });
    const items = await getActiveWorkItems();
    res.json({ items, source: 'db' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/work-items/rca-categories
router.get('/rca-categories', (req, res) => {
  res.json({ categories: ROOT_CAUSE_CATEGORIES });
});

// GET /api/work-items/:id
router.get('/:id', async (req, res) => {
  try {
    const item = await getWorkItemById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/work-items/:id/transition
router.patch('/:id/transition', async (req, res) => {
  const { error, value } = transitionSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  try {
    const newStatus = await transitionWorkItem(req.params.id, value.status, value.rca);
    res.json({ success: true, status: newStatus });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// POST /api/work-items/:id/rca
router.post('/:id/rca', async (req, res) => {
  const { error, value } = rcaSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  try {
    await submitRCA(req.params.id, value);
    res.json({ success: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;

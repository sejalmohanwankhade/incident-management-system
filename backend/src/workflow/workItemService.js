const { v4: uuidv4 } = require('uuid');
const { queryWithRetry, withTransaction } = require('../storage/postgres');
const { Signal } = require('../storage/mongo');
const {
  setDashboardCache,
  invalidateDashboardCache,
  recordComponentAggregation,
} = require('../storage/redis');
const { WorkItemStateMachine, validateRCA } = require('./stateMachine');
const { AlertStrategyContext } = require('./alertStrategy');
const logger = require('../observability/logger');

const alertContext = new AlertStrategyContext();

// ─── Create Work Item ─────────────────────────────────────────────────────────

async function createWorkItem(signal) {
  const alert = alertContext.evaluate(signal);
  const id = uuidv4();

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO work_items
         (id, component_id, severity, status, title, signal_count, start_time)
       VALUES ($1,$2,$3,'OPEN',$4,1,$5)`,
      [id, signal.componentId, alert.severity, alert.title, new Date()]
    );
  });

  logger.info('Work item created', { workItemId: id, componentId: signal.componentId, severity: alert.severity });
  await invalidateDashboardCache();
  return id;
}

// ─── Link Signal ──────────────────────────────────────────────────────────────

async function linkSignalToWorkItem(workItemId, signalId) {
  await Signal.updateOne({ signalId }, { $set: { workItemId } });
  // Increment signal count on the work item
  await queryWithRetry(
    `UPDATE work_items SET signal_count = signal_count + 1, updated_at = NOW() WHERE id = $1`,
    [workItemId]
  );
}

// ─── Persist Raw Signal ───────────────────────────────────────────────────────

async function persistSignal(signal, workItemId = null) {
  const doc = new Signal({
    signalId: signal.signalId,
    workItemId,
    componentId: signal.componentId,
    componentType: signal.componentType,
    errorCode: signal.errorCode,
    message: signal.message,
    latencyMs: signal.latencyMs,
    severity: signal.severity || 'P3',
    metadata: signal.metadata || {},
    receivedAt: new Date(),
  });
  await doc.save();
  await recordComponentAggregation(signal.componentId, signal.severity || 'P3');
}

// ─── Transition Work Item ─────────────────────────────────────────────────────

async function transitionWorkItem(workItemId, targetStatus, rca = null) {
  const result = await queryWithRetry(
    'SELECT id, status FROM work_items WHERE id = $1',
    [workItemId]
  );
  if (result.rows.length === 0) {
    const err = new Error('Work item not found');
    err.statusCode = 404;
    throw err;
  }

  const item = result.rows[0];
  const machine = new WorkItemStateMachine(item.status);
  const newStatus = machine.transitionTo(targetStatus, rca);

  if (newStatus === 'CLOSED') {
    const mttr = await _calcMTTR(workItemId, rca);
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE work_items
         SET status=$1, end_time=$2, mttr_seconds=$3, updated_at=NOW()
         WHERE id=$4`,
        [newStatus, new Date(rca.incident_end), mttr, workItemId]
      );
      await _upsertRCA(client, workItemId, rca);
    });
  } else {
    await queryWithRetry(
      'UPDATE work_items SET status=$1, updated_at=NOW() WHERE id=$2',
      [newStatus, workItemId]
    );
  }

  await invalidateDashboardCache();
  logger.info('Work item transitioned', { workItemId, from: item.status, to: newStatus });
  return newStatus;
}

async function _calcMTTR(workItemId, rca) {
  const res = await queryWithRetry(
    'SELECT start_time FROM work_items WHERE id=$1',
    [workItemId]
  );
  const start = new Date(rca.incident_start || res.rows[0]?.start_time);
  const end = new Date(rca.incident_end);
  return Math.max(0, Math.round((end - start) / 1000));
}

async function _upsertRCA(client, workItemId, rca) {
  validateRCA(rca);
  const id = uuidv4();
  await client.query(
    `INSERT INTO rca_records
       (id, work_item_id, incident_start, incident_end,
        root_cause_category, fix_applied, prevention_steps, submitted_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (work_item_id)
     DO UPDATE SET
       incident_start=$3, incident_end=$4,
       root_cause_category=$5, fix_applied=$6,
       prevention_steps=$7, submitted_at=NOW()`,
    [
      id, workItemId,
      new Date(rca.incident_start), new Date(rca.incident_end),
      rca.root_cause_category, rca.fix_applied, rca.prevention_steps,
      rca.submitted_by || 'system',
    ]
  );
}

// ─── Submit RCA only (without closing) ───────────────────────────────────────

async function submitRCA(workItemId, rca) {
  validateRCA(rca);
  const res = await queryWithRetry('SELECT id FROM work_items WHERE id=$1', [workItemId]);
  if (res.rows.length === 0) {
    const err = new Error('Work item not found'); err.statusCode = 404; throw err;
  }
  await withTransaction(async (client) => {
    await _upsertRCA(client, workItemId, rca);
  });
  return true;
}

// ─── Read Helpers ─────────────────────────────────────────────────────────────

async function getActiveWorkItems() {
  const res = await queryWithRetry(
    `SELECT w.*, r.root_cause_category, r.submitted_at AS rca_submitted_at
     FROM work_items w
     LEFT JOIN rca_records r ON r.work_item_id = w.id
     WHERE w.status != 'CLOSED'
     ORDER BY
       CASE w.severity WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END,
       w.created_at DESC`
  );
  const items = res.rows;
  await setDashboardCache(items);
  return items;
}

async function getWorkItemById(id) {
  const [itemRes, rcaRes, signals] = await Promise.all([
    queryWithRetry('SELECT * FROM work_items WHERE id=$1', [id]),
    queryWithRetry('SELECT * FROM rca_records WHERE work_item_id=$1', [id]),
    Signal.find({ workItemId: id }).sort({ receivedAt: -1 }).limit(200).lean(),
  ]);
  if (itemRes.rows.length === 0) return null;
  return {
    ...itemRes.rows[0],
    rca: rcaRes.rows[0] || null,
    signals,
  };
}

async function getAllWorkItems(status, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const params = [];
  let where = '';
  if (status) {
    params.push(status);
    where = `WHERE status=$${params.length}`;
  }
  params.push(limit, offset);
  const res = await queryWithRetry(
    `SELECT w.*, r.root_cause_category FROM work_items w
     LEFT JOIN rca_records r ON r.work_item_id = w.id
     ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const countRes = await queryWithRetry(
    `SELECT COUNT(*) FROM work_items ${where}`,
    status ? [status] : []
  );
  return { items: res.rows, total: parseInt(countRes.rows[0].count), page, limit };
}

module.exports = {
  createWorkItem,
  linkSignalToWorkItem,
  persistSignal,
  transitionWorkItem,
  submitRCA,
  getActiveWorkItems,
  getWorkItemById,
  getAllWorkItems,
};

const {
  WorkItemStateMachine,
  validateRCA,
  InvalidTransitionError,
  RCAMissingError,
  ROOT_CAUSE_CATEGORIES,
} = require('../../src/workflow/stateMachine');

// ─── State Machine Tests ──────────────────────────────────────────────────────

describe('WorkItemStateMachine', () => {
  test('starts in OPEN state', () => {
    const m = new WorkItemStateMachine('OPEN');
    expect(m.currentStatus).toBe('OPEN');
  });

  test('OPEN → INVESTIGATING', () => {
    const m = new WorkItemStateMachine('OPEN');
    expect(m.investigate()).toBe('INVESTIGATING');
    expect(m.currentStatus).toBe('INVESTIGATING');
  });

  test('INVESTIGATING → RESOLVED', () => {
    const m = new WorkItemStateMachine('INVESTIGATING');
    expect(m.resolve()).toBe('RESOLVED');
  });

  test('RESOLVED → CLOSED with valid RCA', () => {
    const m = new WorkItemStateMachine('RESOLVED');
    const rca = validRCA();
    expect(m.close(rca)).toBe('CLOSED');
  });

  test('OPEN cannot resolve directly', () => {
    const m = new WorkItemStateMachine('OPEN');
    expect(() => m.resolve()).toThrow(InvalidTransitionError);
  });

  test('OPEN cannot close', () => {
    const m = new WorkItemStateMachine('OPEN');
    expect(() => m.close(validRCA())).toThrow(InvalidTransitionError);
  });

  test('INVESTIGATING cannot close directly', () => {
    const m = new WorkItemStateMachine('INVESTIGATING');
    expect(() => m.close(validRCA())).toThrow(InvalidTransitionError);
  });

  test('CLOSED is terminal — no transitions', () => {
    const m = new WorkItemStateMachine('CLOSED');
    expect(() => m.investigate()).toThrow(InvalidTransitionError);
    expect(() => m.resolve()).toThrow(InvalidTransitionError);
    expect(() => m.close(validRCA())).toThrow(InvalidTransitionError);
  });

  test('RESOLVED → CLOSED requires RCA', () => {
    const m = new WorkItemStateMachine('RESOLVED');
    expect(() => m.close(null)).toThrow(RCAMissingError);
  });

  test('transitionTo works for valid transitions', () => {
    const m = new WorkItemStateMachine('OPEN');
    m.transitionTo('INVESTIGATING');
    expect(m.currentStatus).toBe('INVESTIGATING');
  });

  test('loads from existing status string', () => {
    const m = new WorkItemStateMachine('RESOLVED');
    expect(m.currentStatus).toBe('RESOLVED');
  });
});

// ─── RCA Validation Tests ─────────────────────────────────────────────────────

describe('validateRCA', () => {
  test('accepts a complete valid RCA', () => {
    expect(validateRCA(validRCA())).toBe(true);
  });

  test('rejects null RCA', () => {
    expect(() => validateRCA(null)).toThrow(RCAMissingError);
  });

  test('rejects empty object', () => {
    expect(() => validateRCA({})).toThrow(RCAMissingError);
  });

  test('rejects missing fix_applied', () => {
    const rca = validRCA();
    delete rca.fix_applied;
    expect(() => validateRCA(rca)).toThrow(RCAMissingError);
  });

  test('rejects missing prevention_steps', () => {
    const rca = validRCA();
    delete rca.prevention_steps;
    expect(() => validateRCA(rca)).toThrow(RCAMissingError);
  });

  test('rejects missing root_cause_category', () => {
    const rca = validRCA();
    delete rca.root_cause_category;
    expect(() => validateRCA(rca)).toThrow(RCAMissingError);
  });

  test('rejects invalid root_cause_category', () => {
    const rca = validRCA();
    rca.root_cause_category = 'BadCategory';
    expect(() => validateRCA(rca)).toThrow(/root_cause_category/);
  });

  test('rejects end before start', () => {
    const rca = validRCA();
    rca.incident_end = '2024-01-01T00:00:00Z';
    rca.incident_start = '2024-01-01T01:00:00Z';
    expect(() => validateRCA(rca)).toThrow(/incident_end must be after/);
  });

  test('rejects invalid date strings', () => {
    const rca = validRCA();
    rca.incident_start = 'not-a-date';
    expect(() => validateRCA(rca)).toThrow(/valid ISO dates/);
  });

  test('accepts all valid root_cause_categories', () => {
    for (const cat of ROOT_CAUSE_CATEGORIES) {
      const rca = validRCA();
      rca.root_cause_category = cat;
      expect(validateRCA(rca)).toBe(true);
    }
  });
});

// ─── Alert Strategy Tests ─────────────────────────────────────────────────────

const { AlertStrategyContext } = require('../../src/workflow/alertStrategy');

describe('AlertStrategyContext', () => {
  let ctx;
  beforeEach(() => { ctx = new AlertStrategyContext(); });

  test('RDBMS → P0', () => {
    const result = ctx.evaluate({ componentType: 'RDBMS', componentId: 'DB_01' });
    expect(result.severity).toBe('P0');
  });

  test('CACHE → P2', () => {
    const result = ctx.evaluate({ componentType: 'CACHE', componentId: 'CACHE_01' });
    expect(result.severity).toBe('P2');
  });

  test('API with high latency → P1', () => {
    const result = ctx.evaluate({ componentType: 'API', componentId: 'API_01', latencyMs: 6000 });
    expect(result.severity).toBe('P1');
  });

  test('API normal → P2', () => {
    const result = ctx.evaluate({ componentType: 'API', componentId: 'API_01', latencyMs: 100 });
    expect(result.severity).toBe('P2');
  });

  test('Unknown type → P3 default', () => {
    const result = ctx.evaluate({ componentType: 'UNKNOWN_XYZ', componentId: 'FOO' });
    expect(result.severity).toBe('P3');
  });

  test('title is generated', () => {
    const result = ctx.evaluate({ componentType: 'RDBMS', componentId: 'DB_PRIMARY' });
    expect(result.title).toContain('DB_PRIMARY');
  });
});

// ─── RingBuffer Tests ─────────────────────────────────────────────────────────

const RingBuffer = require('../../src/ingestion/ringBuffer');

describe('RingBuffer', () => {
  test('push and pop', () => {
    const rb = new RingBuffer(10);
    rb.push('a');
    rb.push('b');
    expect(rb.pop()).toBe('a');
    expect(rb.pop()).toBe('b');
    expect(rb.pop()).toBe(null);
  });

  test('size tracking', () => {
    const rb = new RingBuffer(5);
    rb.push(1); rb.push(2);
    expect(rb.size).toBe(2);
    rb.pop();
    expect(rb.size).toBe(1);
  });

  test('overwrites oldest on overflow and tracks dropped', () => {
    const rb = new RingBuffer(3);
    rb.push('a'); rb.push('b'); rb.push('c');
    rb.push('d'); // should drop 'a'
    expect(rb.droppedCount).toBe(1);
    expect(rb.size).toBe(3);
  });

  test('drain returns multiple items', () => {
    const rb = new RingBuffer(100);
    for (let i = 0; i < 10; i++) rb.push(i);
    const items = rb.drain(5);
    expect(items.length).toBe(5);
    expect(rb.size).toBe(5);
  });

  test('isEmpty and isFull', () => {
    const rb = new RingBuffer(2);
    expect(rb.isEmpty).toBe(true);
    rb.push(1); rb.push(2);
    expect(rb.isFull).toBe(true);
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function validRCA() {
  return {
    incident_start: '2024-01-01T10:00:00Z',
    incident_end: '2024-01-01T11:00:00Z',
    root_cause_category: 'Infrastructure',
    fix_applied: 'Restarted the affected database cluster nodes.',
    prevention_steps: 'Added automated failover and improved monitoring alerts.',
  };
}

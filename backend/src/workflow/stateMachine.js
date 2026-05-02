/**
 * Work Item State Machine — State Design Pattern.
 *
 * States: OPEN → INVESTIGATING → RESOLVED → CLOSED
 *
 * CLOSED requires a complete RCA. Any invalid transition throws.
 */

class WorkItemState {
  constructor(context) {
    this.context = context;
  }

  get name() {
    throw new Error('name getter must be implemented');
  }

  investigate() {
    throw new InvalidTransitionError(this.name, 'INVESTIGATING');
  }

  resolve() {
    throw new InvalidTransitionError(this.name, 'RESOLVED');
  }

  close() {
    throw new InvalidTransitionError(this.name, 'CLOSED');
  }
}

class InvalidTransitionError extends Error {
  constructor(from, to) {
    super(`Invalid transition from ${from} to ${to}`);
    this.statusCode = 422;
  }
}

class RCAMissingError extends Error {
  constructor() {
    super('Cannot close incident: RCA is missing or incomplete');
    this.statusCode = 422;
  }
}

// ─── Concrete States ────────────────────────────────────────────────────────

class OpenState extends WorkItemState {
  get name() { return 'OPEN'; }

  investigate() {
    this.context.setState(new InvestigatingState(this.context));
    return 'INVESTIGATING';
  }
}

class InvestigatingState extends WorkItemState {
  get name() { return 'INVESTIGATING'; }

  resolve() {
    this.context.setState(new ResolvedState(this.context));
    return 'RESOLVED';
  }
}

class ResolvedState extends WorkItemState {
  get name() { return 'RESOLVED'; }

  close(rca) {
    validateRCA(rca);
    this.context.setState(new ClosedState(this.context));
    return 'CLOSED';
  }
}

class ClosedState extends WorkItemState {
  get name() { return 'CLOSED'; }
  // Terminal state — no transitions allowed
}

// ─── State Context ───────────────────────────────────────────────────────────

class WorkItemStateMachine {
  constructor(currentStatus = 'OPEN') {
    this._state = this._fromString(currentStatus);
  }

  setState(state) {
    this._state = state;
  }

  get currentStatus() {
    return this._state.name;
  }

  /**
   * Transition to INVESTIGATING.
   */
  investigate() {
    return this._state.investigate();
  }

  /**
   * Transition to RESOLVED.
   */
  resolve() {
    return this._state.resolve();
  }

  /**
   * Transition to CLOSED. Requires complete RCA.
   * @param {object} rca - RCA record to validate
   */
  close(rca) {
    return this._state.close(rca);
  }

  /**
   * Execute a generic transition by target status string.
   */
  transitionTo(targetStatus, rca = null) {
    switch (targetStatus) {
      case 'INVESTIGATING': return this.investigate();
      case 'RESOLVED':      return this.resolve();
      case 'CLOSED':        return this.close(rca);
      default:
        throw new InvalidTransitionError(this.currentStatus, targetStatus);
    }
  }

  _fromString(status) {
    const map = {
      OPEN: OpenState,
      INVESTIGATING: InvestigatingState,
      RESOLVED: ResolvedState,
      CLOSED: ClosedState,
    };
    const Cls = map[status];
    if (!Cls) throw new Error(`Unknown status: ${status}`);
    return new Cls(this);
  }
}

// ─── RCA Validation ──────────────────────────────────────────────────────────

const REQUIRED_FIELDS = [
  'incident_start',
  'incident_end',
  'root_cause_category',
  'fix_applied',
  'prevention_steps',
];

const ROOT_CAUSE_CATEGORIES = [
  'Infrastructure',
  'Application Bug',
  'Configuration Change',
  'Dependency Failure',
  'Human Error',
  'Capacity',
  'Security',
  'Unknown',
];

function validateRCA(rca) {
  if (!rca || typeof rca !== 'object') {
    throw new RCAMissingError();
  }

  for (const field of REQUIRED_FIELDS) {
    if (!rca[field] || String(rca[field]).trim() === '') {
      throw new RCAMissingError();
    }
  }

  if (!ROOT_CAUSE_CATEGORIES.includes(rca.root_cause_category)) {
    const err = new Error(
      `root_cause_category must be one of: ${ROOT_CAUSE_CATEGORIES.join(', ')}`
    );
    err.statusCode = 422;
    throw err;
  }

  const start = new Date(rca.incident_start);
  const end = new Date(rca.incident_end);
  if (isNaN(start) || isNaN(end)) {
    const err = new Error('incident_start and incident_end must be valid ISO dates');
    err.statusCode = 422;
    throw err;
  }
  if (end <= start) {
    const err = new Error('incident_end must be after incident_start');
    err.statusCode = 422;
    throw err;
  }

  return true;
}

module.exports = {
  WorkItemStateMachine,
  validateRCA,
  ROOT_CAUSE_CATEGORIES,
  InvalidTransitionError,
  RCAMissingError,
};

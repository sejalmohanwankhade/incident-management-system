/**
 * Debouncer — implements the debouncing requirement:
 * If 100+ signals arrive for the same ComponentID within WINDOW_MS,
 * only one Work Item is created. All signals are linked to it.
 *
 * Uses a Map keyed by componentId. Each entry tracks:
 *   - count of signals in the current window
 *   - workItemId once created
 *   - windowStart timestamp
 */
class Debouncer {
  constructor({
    windowMs = 10000,
    threshold = 100,
    onNewWorkItem,   // async (componentId, signals[]) => workItemId
    onLinkSignal,    // async (workItemId, signalId) => void
  } = {}) {
    this.windowMs = windowMs;
    this.threshold = threshold;
    this.onNewWorkItem = onNewWorkItem;
    this.onLinkSignal = onLinkSignal;
    /** @type {Map<string, {count, workItemId, windowStart, signals[]}>} */
    this.windows = new Map();
    this._startCleanup();
  }

  /**
   * Process a single signal.
   * Returns { workItemId: string|null, isNew: boolean }
   */
  async process(signal) {
    const { componentId, signalId } = signal;
    const now = Date.now();

    if (!this.windows.has(componentId)) {
      this.windows.set(componentId, {
        count: 0,
        workItemId: null,
        windowStart: now,
        signals: [],
      });
    }

    const entry = this.windows.get(componentId);

    // Reset window if expired
    if (now - entry.windowStart > this.windowMs) {
      entry.count = 0;
      entry.windowStart = now;
      entry.signals = [];
      // Note: workItemId persists — ongoing incident
    }

    entry.count++;
    entry.signals.push(signal);

    // First signal in a new window always creates a work item
    if (!entry.workItemId) {
      try {
        const workItemId = await this.onNewWorkItem(signal, entry.signals);
        entry.workItemId = workItemId;
        return { workItemId, isNew: true };
      } catch (err) {
        // Will retry next signal
        return { workItemId: null, isNew: false };
      }
    }

    // Subsequent signals: just link them
    if (entry.workItemId && signalId) {
      // Fire-and-forget link (non-blocking)
      setImmediate(() => {
        this.onLinkSignal(entry.workItemId, signalId).catch(() => {});
      });
    }

    return { workItemId: entry.workItemId, isNew: false };
  }

  /**
   * Get active debounce state for a component.
   */
  getState(componentId) {
    return this.windows.get(componentId) || null;
  }

  /**
   * Manually clear a component's window (e.g., after incident resolved).
   */
  clear(componentId) {
    this.windows.delete(componentId);
  }

  _startCleanup() {
    // Every 30s, remove windows with no workItemId older than 2x windowMs
    this._cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.windows.entries()) {
        if (!entry.workItemId && now - entry.windowStart > this.windowMs * 2) {
          this.windows.delete(key);
        }
      }
    }, 30000);
    this._cleanupInterval.unref();
  }

  destroy() {
    clearInterval(this._cleanupInterval);
  }
}

module.exports = Debouncer;

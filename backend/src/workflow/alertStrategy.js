/**
 * Alerting Strategy — Strategy Design Pattern.
 *
 * Each component type has a different alerting strategy defining:
 *   - default severity (P0-P3)
 *   - notification channels
 *   - escalation rules
 */

class AlertStrategy {
  /**
   * @param {object} signal
   * @returns {{ severity: string, channels: string[], escalateAfterMin: number }}
   */
  evaluate(signal) {
    throw new Error('evaluate() must be implemented');
  }
}

class RDBMSAlertStrategy extends AlertStrategy {
  evaluate(signal) {
    // Database failures are always P0 — immediate page
    return {
      severity: 'P0',
      channels: ['pagerduty', 'slack:#incidents', 'email:oncall'],
      escalateAfterMin: 5,
      title: `[P0] RDBMS failure on ${signal.componentId}`,
    };
  }
}

class APIAlertStrategy extends AlertStrategy {
  evaluate(signal) {
    const isHighLatency = signal.latencyMs && signal.latencyMs > 5000;
    const severity = isHighLatency ? 'P1' : 'P2';
    return {
      severity,
      channels: ['slack:#incidents', 'email:oncall'],
      escalateAfterMin: 15,
      title: `[${severity}] API issue on ${signal.componentId}`,
    };
  }
}

class CacheAlertStrategy extends AlertStrategy {
  evaluate(signal) {
    return {
      severity: 'P2',
      channels: ['slack:#alerts'],
      escalateAfterMin: 30,
      title: `[P2] Cache failure on ${signal.componentId}`,
    };
  }
}

class QueueAlertStrategy extends AlertStrategy {
  evaluate(signal) {
    // Queue lag can cascade — treat as P1
    return {
      severity: 'P1',
      channels: ['slack:#incidents', 'pagerduty'],
      escalateAfterMin: 10,
      title: `[P1] Queue issue on ${signal.componentId}`,
    };
  }
}

class MCPHostAlertStrategy extends AlertStrategy {
  evaluate(signal) {
    return {
      severity: 'P1',
      channels: ['slack:#incidents'],
      escalateAfterMin: 10,
      title: `[P1] MCP Host failure on ${signal.componentId}`,
    };
  }
}

class NoSQLAlertStrategy extends AlertStrategy {
  evaluate(signal) {
    return {
      severity: 'P2',
      channels: ['slack:#alerts'],
      escalateAfterMin: 20,
      title: `[P2] NoSQL issue on ${signal.componentId}`,
    };
  }
}

class DefaultAlertStrategy extends AlertStrategy {
  evaluate(signal) {
    return {
      severity: 'P3',
      channels: ['slack:#alerts'],
      escalateAfterMin: 60,
      title: `[P3] Unknown component issue: ${signal.componentId}`,
    };
  }
}

/**
 * AlertStrategyContext — selects the right strategy based on componentType.
 */
class AlertStrategyContext {
  constructor() {
    this._strategies = {
      RDBMS: new RDBMSAlertStrategy(),
      API: new APIAlertStrategy(),
      CACHE: new CacheAlertStrategy(),
      QUEUE: new QueueAlertStrategy(),
      MCP_HOST: new MCPHostAlertStrategy(),
      NOSQL: new NoSQLAlertStrategy(),
    };
    this._default = new DefaultAlertStrategy();
  }

  /**
   * Evaluate a signal and return alerting metadata.
   */
  evaluate(signal) {
    const strategy = this._strategies[signal.componentType] || this._default;
    return strategy.evaluate(signal);
  }

  /**
   * Register a custom strategy at runtime.
   */
  register(componentType, strategy) {
    if (!(strategy instanceof AlertStrategy)) {
      throw new Error('strategy must extend AlertStrategy');
    }
    this._strategies[componentType] = strategy;
  }
}

module.exports = { AlertStrategyContext, AlertStrategy };

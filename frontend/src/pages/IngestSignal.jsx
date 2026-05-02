import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ingestBatch } from '../api/client';

const TEMPLATES = [
  {
    label: 'RDBMS Outage (P0)',
    signals: [
      { componentId: 'POSTGRES_PRIMARY', componentType: 'RDBMS', errorCode: 'CONN_REFUSED', message: 'Connection refused to primary PostgreSQL node', latencyMs: null },
      { componentId: 'POSTGRES_PRIMARY', componentType: 'RDBMS', errorCode: 'CONN_TIMEOUT', message: 'Query timeout on primary: SELECT * FROM users', latencyMs: 30000 },
    ],
  },
  {
    label: 'Cache Failure (P2)',
    signals: [
      { componentId: 'CACHE_CLUSTER_01', componentType: 'CACHE', errorCode: 'CACHE_MISS_STORM', message: 'Redis cluster node unreachable', latencyMs: 5000 },
      { componentId: 'CACHE_CLUSTER_01', componentType: 'CACHE', errorCode: 'EVICTION_HIGH', message: 'High eviction rate on cache cluster', latencyMs: null },
    ],
  },
  {
    label: 'API Latency Spike (P1)',
    signals: [
      { componentId: 'API_GATEWAY', componentType: 'API', errorCode: 'HTTP_504', message: 'Gateway timeout on /api/v1/users', latencyMs: 8000 },
      { componentId: 'API_GATEWAY', componentType: 'API', errorCode: 'HTTP_503', message: 'Service unavailable: upstream timeout', latencyMs: 6500 },
    ],
  },
  {
    label: 'Queue Backlog (P1)',
    signals: [
      { componentId: 'ASYNC_QUEUE_01', componentType: 'QUEUE', errorCode: 'LAG_HIGH', message: 'Consumer lag exceeds threshold: 50000 messages', latencyMs: null },
    ],
  },
  {
    label: 'MCP Host Down (P1)',
    signals: [
      { componentId: 'MCP_HOST_EU_1', componentType: 'MCP_HOST', errorCode: 'HOST_UNREACHABLE', message: 'MCP host eu-west-1 not responding to health checks', latencyMs: null },
    ],
  },
];

export default function IngestSignal() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(null);
  const [custom, setCustom] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSend(signals) {
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await ingestBatch(signals);
      setResult(res);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleCustomSend() {
    try {
      const parsed = JSON.parse(custom);
      await handleSend(Array.isArray(parsed) ? parsed : [parsed]);
    } catch {
      setError('Invalid JSON');
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: 14, marginBottom: 16 }}>
        ← Dashboard
      </button>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Inject Test Signals</h1>
      <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 24 }}>Send mock failure events to simulate incidents.</p>

      {error && <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '10px 14px', marginBottom: 16 }}>{error}</div>}
      {result && <div style={{ background: '#d1fae5', color: '#065f46', borderRadius: 6, padding: '10px 14px', marginBottom: 16 }}>✅ Accepted {result.count} signal(s)</div>}

      <h3 style={{ fontSize: 15, marginBottom: 12 }}>Quick Templates</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
        {TEMPLATES.map(t => (
          <div key={t.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, color: '#111827' }}>{t.label}</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{t.signals.length} signal(s) · {t.signals[0].componentId}</div>
            </div>
            <button onClick={() => handleSend(t.signals)} disabled={loading}
              style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Send
            </button>
          </div>
        ))}
      </div>

      <h3 style={{ fontSize: 15, marginBottom: 12 }}>Custom JSON Payload</h3>
      <textarea
        rows={8}
        value={custom}
        onChange={e => setCustom(e.target.value)}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: 12, padding: 12, border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box', resize: 'vertical' }}
        placeholder={`[\n  {\n    "componentId": "MY_SERVICE",\n    "componentType": "API",\n    "message": "Something went wrong",\n    "errorCode": "ERR_001"\n  }\n]`}
      />
      <button onClick={handleCustomSend} disabled={loading || !custom.trim()}
        style={{ marginTop: 10, background: '#111827', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
        {loading ? 'Sending...' : 'Send Custom'}
      </button>
    </div>
  );
}

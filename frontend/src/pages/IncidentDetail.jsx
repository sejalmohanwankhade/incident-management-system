import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getWorkItem, transitionWorkItem, submitRCA, getRCACategories } from '../api/client';
import SeverityBadge from '../components/SeverityBadge';
import StatusBadge from '../components/StatusBadge';
import { format } from 'date-fns';

const TRANSITIONS = {
  OPEN: 'INVESTIGATING',
  INVESTIGATING: 'RESOLVED',
  RESOLVED: 'CLOSED',
};

export default function IncidentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [transitioning, setTransitioning] = useState(false);
  const [showRCA, setShowRCA] = useState(false);
  const [rca, setRCA] = useState({
    incident_start: '', incident_end: '',
    root_cause_category: '', fix_applied: '', prevention_steps: '', submitted_by: '',
  });
  const [rcaError, setRcaError] = useState('');
  const [rcaSuccess, setRcaSuccess] = useState('');

  useEffect(() => {
    load();
    getRCACategories().then(d => setCategories(d.categories || [])).catch(() => {});
  }, [id]);

  async function load() {
    setLoading(true);
    try {
      const data = await getWorkItem(id);
      setItem(data);
      if (data.rca) {
        setRCA({
          incident_start: data.rca.incident_start?.slice(0, 16) || '',
          incident_end: data.rca.incident_end?.slice(0, 16) || '',
          root_cause_category: data.rca.root_cause_category || '',
          fix_applied: data.rca.fix_applied || '',
          prevention_steps: data.rca.prevention_steps || '',
          submitted_by: data.rca.submitted_by || '',
        });
      } else if (data.start_time) {
        setRCA(r => ({ ...r, incident_start: data.start_time?.slice(0, 16) || '' }));
      }
      if (data.status === 'RESOLVED') setShowRCA(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleTransition() {
    const nextStatus = TRANSITIONS[item.status];
    if (!nextStatus) return;
    if (nextStatus === 'CLOSED') {
      setShowRCA(true);
      return;
    }
    setTransitioning(true);
    try {
      await transitionWorkItem(id, nextStatus);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setTransitioning(false);
    }
  }

  async function handleCloseWithRCA() {
    setRcaError(''); setRcaSuccess('');
    setTransitioning(true);
    try {
      const rcaPayload = { ...rca, incident_start: new Date(rca.incident_start).toISOString(), incident_end: new Date(rca.incident_end).toISOString() };
      await transitionWorkItem(id, 'CLOSED', rcaPayload);
      setRcaSuccess('Incident closed successfully.');
      await load();
    } catch (e) {
      setRcaError(String(e));
    } finally {
      setTransitioning(false);
    }
  }

  async function handleSaveRCA() {
    setRcaError(''); setRcaSuccess('');
    try {
      const rcaPayload = { ...rca, incident_start: new Date(rca.incident_start).toISOString(), incident_end: new Date(rca.incident_end).toISOString() };
      await submitRCA(id, rcaPayload);
      setRcaSuccess('RCA saved.');
      await load();
    } catch (e) {
      setRcaError(String(e));
    }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading...</div>;
  if (error) return <div style={{ padding: 40, color: '#dc2626' }}>Error: {error}</div>;
  if (!item) return <div style={{ padding: 40 }}>Not found</div>;

  const nextStatus = TRANSITIONS[item.status];
  const mttrStr = item.mttr_seconds ? `${Math.round(item.mttr_seconds / 60)} min` : '—';

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: 14, marginBottom: 16 }}>
        ← Back
      </button>

      {/* Header */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 24, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <SeverityBadge severity={item.severity} />
          <StatusBadge status={item.status} />
        </div>
        <h2 style={{ margin: '0 0 8px', fontSize: 20, color: '#111827' }}>{item.title}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginTop: 16 }}>
          {[
            ['Component', item.component_id],
            ['Signals', item.signal_count],
            ['Started', item.start_time ? format(new Date(item.start_time), 'MMM d, HH:mm') : '—'],
            ['MTTR', mttrStr],
          ].map(([label, val]) => (
            <div key={label} style={{ background: '#f9fafb', borderRadius: 6, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>{label}</div>
              <div style={{ fontWeight: 600, color: '#111827' }}>{val}</div>
            </div>
          ))}
        </div>

        {item.status !== 'CLOSED' && nextStatus && (
          <button
            onClick={handleTransition}
            disabled={transitioning}
            style={{ marginTop: 16, ...btnStyle(nextStatus === 'CLOSED' ? '#dc2626' : '#6366f1') }}
          >
            {transitioning ? 'Processing...' : `→ Move to ${nextStatus}`}
          </button>
        )}
      </div>

      {/* Raw Signals */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 24, marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Raw Signals ({item.signals?.length || 0})</h3>
        {!item.signals?.length ? (
          <p style={{ color: '#9ca3af', fontSize: 13 }}>No signals linked yet.</p>
        ) : (
          <div style={{ maxHeight: 300, overflowY: 'auto', fontFamily: 'monospace', fontSize: 12 }}>
            {item.signals.map((s, i) => (
              <div key={i} style={{ padding: '8px 10px', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <SeverityBadge severity={s.severity} />
                <div>
                  <div style={{ color: '#374151' }}>{s.message}</div>
                  <div style={{ color: '#9ca3af', marginTop: 2 }}>
                    {s.componentId} · {s.errorCode || 'no code'} · {s.latencyMs != null ? `${s.latencyMs}ms` : ''} · {s.receivedAt ? format(new Date(s.receivedAt), 'HH:mm:ss') : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* RCA Form */}
      {(showRCA || item.status === 'RESOLVED' || item.status === 'CLOSED') && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 24 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Root Cause Analysis {item.rca ? '✅' : ''}</h3>
          {rcaError && <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '10px 14px', marginBottom: 12 }}>{rcaError}</div>}
          {rcaSuccess && <div style={{ background: '#d1fae5', color: '#065f46', borderRadius: 6, padding: '10px 14px', marginBottom: 12 }}>{rcaSuccess}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <Field label="Incident Start *">
              <input type="datetime-local" value={rca.incident_start} onChange={e => setRCA({ ...rca, incident_start: e.target.value })} style={inputStyle} disabled={item.status === 'CLOSED'} />
            </Field>
            <Field label="Incident End *">
              <input type="datetime-local" value={rca.incident_end} onChange={e => setRCA({ ...rca, incident_end: e.target.value })} style={inputStyle} disabled={item.status === 'CLOSED'} />
            </Field>
          </div>

          <Field label="Root Cause Category *" style={{ marginBottom: 16 }}>
            <select value={rca.root_cause_category} onChange={e => setRCA({ ...rca, root_cause_category: e.target.value })} style={inputStyle} disabled={item.status === 'CLOSED'}>
              <option value="">Select a category...</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>

          <Field label="Fix Applied *" style={{ marginBottom: 16 }}>
            <textarea rows={3} value={rca.fix_applied} onChange={e => setRCA({ ...rca, fix_applied: e.target.value })} style={{ ...inputStyle, resize: 'vertical' }} disabled={item.status === 'CLOSED'} placeholder="Describe the fix that was applied..." />
          </Field>

          <Field label="Prevention Steps *" style={{ marginBottom: 16 }}>
            <textarea rows={3} value={rca.prevention_steps} onChange={e => setRCA({ ...rca, prevention_steps: e.target.value })} style={{ ...inputStyle, resize: 'vertical' }} disabled={item.status === 'CLOSED'} placeholder="Steps to prevent recurrence..." />
          </Field>

          <Field label="Submitted By">
            <input type="text" value={rca.submitted_by} onChange={e => setRCA({ ...rca, submitted_by: e.target.value })} style={inputStyle} disabled={item.status === 'CLOSED'} placeholder="Your name / team" />
          </Field>

          {item.status !== 'CLOSED' && (
            <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
              <button onClick={handleSaveRCA} style={btnStyle('#6366f1')} disabled={transitioning}>Save RCA (draft)</button>
              <button onClick={handleCloseWithRCA} style={btnStyle('#dc2626')} disabled={transitioning}>Submit & Close Incident</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children, style }) {
  return (
    <div style={style}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
  borderRadius: 6, fontSize: 14, boxSizing: 'border-box', background: '#fff',
};

function btnStyle(color) {
  return { background: color, color: '#fff', border: 'none', borderRadius: 6, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' };
}

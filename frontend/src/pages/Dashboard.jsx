import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getActiveWorkItems } from '../api/client';
import { useWebSocket } from '../hooks/useWebSocket';
import SeverityBadge from '../components/SeverityBadge';
import StatusBadge from '../components/StatusBadge';
import { formatDistanceToNow } from 'date-fns';

export default function Dashboard() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const navigate = useNavigate();

  const fetchItems = useCallback(async () => {
    try {
      const data = await getActiveWorkItems();
      setItems(data.items || []);
      setLastUpdate(new Date());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
    const interval = setInterval(fetchItems, 15000);
    return () => clearInterval(interval);
  }, [fetchItems]);

  useWebSocket((msg) => {
    if (msg.type === 'work_item_updated' || msg.type === 'work_item_created') {
      fetchItems();
    }
  });

  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#111827' }}>
            🚨 Incident Dashboard
          </h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
            Live feed — active incidents sorted by severity
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          {lastUpdate && (
            <span style={{ fontSize: 12, color: '#9ca3af' }}>
              Updated {formatDistanceToNow(lastUpdate, { addSuffix: true })}
            </span>
          )}
          <div style={{ marginTop: 8 }}>
            <button
              onClick={() => navigate('/all')}
              style={btnStyle('#6366f1')}
            >
              All Incidents
            </button>
            <button
              onClick={() => navigate('/ingest')}
              style={{ ...btnStyle('#10b981'), marginLeft: 8 }}
            >
              + Inject Signal
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>Loading...</div>
      ) : items.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 60, background: '#f9fafb',
          borderRadius: 12, border: '1px dashed #e5e7eb', color: '#6b7280'
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>All clear — no active incidents</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map(item => (
            <IncidentCard key={item.id} item={item} onClick={() => navigate(`/incident/${item.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}

function IncidentCard({ item, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
        padding: '16px 20px', cursor: 'pointer', transition: 'box-shadow 0.15s',
        display: 'grid', gridTemplateColumns: '1fr auto',
        gap: 12, alignItems: 'center',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <SeverityBadge severity={item.severity} />
          <StatusBadge status={item.status} />
          <span style={{ fontSize: 12, color: '#9ca3af' }}>{item.component_id}</span>
        </div>
        <div style={{ fontWeight: 600, color: '#111827', marginBottom: 4 }}>{item.title}</div>
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          {item.signal_count} signal{item.signal_count !== 1 ? 's' : ''} ·{' '}
          Started {formatDistanceToNow(new Date(item.start_time), { addSuffix: true })}
        </div>
      </div>
      <div style={{ color: '#9ca3af', fontSize: 20 }}>›</div>
    </div>
  );
}

function btnStyle(color) {
  return {
    background: color, color: '#fff', border: 'none', borderRadius: 6,
    padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  };
}

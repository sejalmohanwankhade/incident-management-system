import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllWorkItems } from '../api/client';
import SeverityBadge from '../components/SeverityBadge';
import StatusBadge from '../components/StatusBadge';
import { format } from 'date-fns';

const STATUSES = ['', 'OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED'];

export default function AllIncidents() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getAllWorkItems(status || undefined, page)
      .then(d => { setItems(d.items); setTotal(d.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [status, page]);

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>All Incidents</h1>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: 14 }}>← Dashboard</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {STATUSES.map(s => (
          <button key={s || 'all'} onClick={() => { setStatus(s); setPage(1); }}
            style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid #e5e7eb', cursor: 'pointer', fontSize: 13,
              background: status === s ? '#6366f1' : '#fff', color: status === s ? '#fff' : '#374151', fontWeight: status === s ? 600 : 400 }}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Loading...</div>
      ) : (
        <>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  {['Severity', 'Title', 'Component', 'Status', 'Signals', 'MTTR', 'Started'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#6b7280' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} onClick={() => navigate(`/incident/${item.id}`)}
                    style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <td style={{ padding: '10px 14px' }}><SeverityBadge severity={item.severity} /></td>
                    <td style={{ padding: '10px 14px', fontWeight: 500, color: '#111827', maxWidth: 300 }}>{item.title}</td>
                    <td style={{ padding: '10px 14px', color: '#6b7280' }}>{item.component_id}</td>
                    <td style={{ padding: '10px 14px' }}><StatusBadge status={item.status} /></td>
                    <td style={{ padding: '10px 14px', color: '#6b7280' }}>{item.signal_count}</td>
                    <td style={{ padding: '10px 14px', color: '#6b7280' }}>{item.mttr_seconds ? `${Math.round(item.mttr_seconds / 60)}m` : '—'}</td>
                    <td style={{ padding: '10px 14px', color: '#9ca3af' }}>{item.start_time ? format(new Date(item.start_time), 'MMM d, HH:mm') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
            <span style={{ fontSize: 13, color: '#6b7280' }}>{total} incident{total !== 1 ? 's' : ''}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} style={pageBtnStyle(page !== 1)}>← Prev</button>
              <span style={{ padding: '6px 12px', fontSize: 13 }}>Page {page}</span>
              <button disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)} style={pageBtnStyle(page * 20 < total)}>Next →</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function pageBtnStyle(enabled) {
  return { padding: '6px 16px', borderRadius: 6, border: '1px solid #e5e7eb', cursor: enabled ? 'pointer' : 'not-allowed', fontSize: 13, background: '#fff', color: enabled ? '#374151' : '#d1d5db' };
}

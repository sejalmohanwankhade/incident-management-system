import React from 'react';

const colors = {
  OPEN: { bg: '#fee2e2', text: '#991b1b' },
  INVESTIGATING: { bg: '#fef3c7', text: '#92400e' },
  RESOLVED: { bg: '#dbeafe', text: '#1e40af' },
  CLOSED: { bg: '#f0fdf4', text: '#166534' },
};

export default function StatusBadge({ status }) {
  const c = colors[status] || { bg: '#f3f4f6', text: '#374151' };
  return (
    <span style={{
      background: c.bg, color: c.text,
      borderRadius: 4, padding: '2px 10px', fontSize: 12, fontWeight: 600,
      display: 'inline-block',
    }}>
      {status}
    </span>
  );
}

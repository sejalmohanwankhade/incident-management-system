import React from 'react';

const colors = {
  P0: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  P1: { bg: '#ffedd5', text: '#9a3412', border: '#fdba74' },
  P2: { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  P3: { bg: '#f0fdf4', text: '#166534', border: '#86efac' },
};

export default function SeverityBadge({ severity }) {
  const c = colors[severity] || colors.P3;
  return (
    <span style={{
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 700,
      letterSpacing: 1, display: 'inline-block',
    }}>
      {severity}
    </span>
  );
}

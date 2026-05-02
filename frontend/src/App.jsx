import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import IncidentDetail from './pages/IncidentDetail';
import AllIncidents from './pages/AllIncidents';
import IngestSignal from './pages/IngestSignal';

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif' }}>
        <nav style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0 24px', height: 52, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>🛡 IMS</span>
          <span style={{ color: '#d1d5db', margin: '0 4px' }}>|</span>
          <span style={{ fontSize: 13, color: '#6b7280' }}>Incident Management System</span>
        </nav>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/all" element={<AllIncidents />} />
          <Route path="/incident/:id" element={<IncidentDetail />} />
          <Route path="/ingest" element={<IngestSignal />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

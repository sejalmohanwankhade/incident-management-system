import axios from 'axios';

const BASE = process.env.REACT_APP_API_URL || '/api';

const api = axios.create({ baseURL: BASE, timeout: 10000 });

api.interceptors.response.use(
  r => r.data,
  err => Promise.reject(err.response?.data?.error || err.message)
);

export const getActiveWorkItems = () => api.get('/work-items/active');
export const getAllWorkItems = (status, page = 1) =>
  api.get('/work-items', { params: { status, page, limit: 20 } });
export const getWorkItem = (id) => api.get(`/work-items/${id}`);
export const transitionWorkItem = (id, status, rca) =>
  api.patch(`/work-items/${id}/transition`, { status, rca });
export const submitRCA = (id, rca) => api.post(`/work-items/${id}/rca`, rca);
export const getRCACategories = () => api.get('/work-items/rca-categories');
export const ingestSignal = (signal) => api.post('/signals', signal);
export const ingestBatch = (signals) => api.post('/signals/batch', signals);
export const getHealth = () => api.get('/health');
export const getMetrics = () => api.get('/metrics');

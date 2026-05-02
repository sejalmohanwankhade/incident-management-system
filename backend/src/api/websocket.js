const WebSocket = require('ws');
const logger = require('../observability/logger');

let wss;
const clients = new Set();

function initWebSocket(server) {
  wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    clients.add(ws);
    logger.info('WebSocket client connected', { total: clients.size });

    ws.on('close', () => {
      clients.delete(ws);
      logger.info('WebSocket client disconnected', { total: clients.size });
    });

    ws.on('error', (err) => {
      logger.error('WebSocket error', { error: err.message });
      clients.delete(ws);
    });

    // Send welcome
    ws.send(JSON.stringify({ type: 'connected', message: 'IMS live feed active' }));
  });

  return wss;
}

/**
 * Broadcast an event to all connected WebSocket clients.
 */
function broadcast(type, payload) {
  if (!wss) return;
  const message = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message, (err) => {
        if (err) clients.delete(client);
      });
    }
  }
}

module.exports = { initWebSocket, broadcast };

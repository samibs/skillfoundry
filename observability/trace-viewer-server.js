/**
 * Trace Viewer - Web-based trace visualization
 */

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import { ObservabilityManager } from './observability-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.static(join(__dirname, '../logs/dashboards')));

const obsManager = new ObservabilityManager();

// API Routes

// Get session trace
app.get('/api/traces/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const date = req.query.date || null;
    const trace = await obsManager.getSessionTrace(sessionId, date);
    res.json(trace);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get metrics summary
app.get('/api/metrics/summary', async (req, res) => {
  try {
    const summary = obsManager.getMetricsSummary();
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get audit trail
app.get('/api/audit/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    const trail = await obsManager.getAuditTrail(category, limit);
    res.json(trail);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List available sessions
app.get('/api/traces/sessions', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const tracesDir = join(process.cwd(), 'logs', 'traces', date);
    
    try {
      const files = await fs.readdir(tracesDir);
      const sessions = files
        .filter(f => f.startsWith('session-') && f.endsWith('.jsonl'))
        .map(f => f.replace('session-', '').replace('.jsonl', ''));
      
      res.json({ sessions, date });
    } catch (error) {
      if (error.code === 'ENOENT') {
        res.json({ sessions: [], date });
      } else {
        throw error;
      }
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`Observability Trace Viewer running on http://localhost:${PORT}`);
});

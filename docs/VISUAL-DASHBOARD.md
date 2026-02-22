# Visual Dashboard - Web UI for SkillFoundry

**Version**: 1.0  
**Status**: IMPLEMENTATION  
**Date**: January 25, 2026

---

## Overview

A web-based dashboard for visualizing PRD progress, story tracking, agent activity, and project metrics. Runs locally on `localhost:3000`.

---

## Features

### 1. PRD Management
- Create, edit, and track PRDs
- View PRD status (Draft, In Progress, Complete)
- Link PRDs to stories
- PRD dependency visualization

### 2. Story Tracking
- View all stories with status (Pending, In Progress, Complete)
- Story dependency graph
- Progress indicators
- Filter by PRD, status, or phase

### 3. Agent Activity Log
- Timeline of agent actions
- Filter by agent type
- View agent outputs
- Success/failure indicators

### 4. Metrics Dashboard
- Token usage over time
- Completion rates
- Test coverage trends
- Security scan results

### 5. Project Health
- Overall project status
- Blockers and issues
- Next steps recommendations
- Health score

---

## Architecture

```
dashboard/
├── server/
│   ├── index.js              # Express server
│   ├── routes/
│   │   ├── prds.js          # PRD endpoints
│   │   ├── stories.js        # Story endpoints
│   │   ├── agents.js        # Agent activity endpoints
│   │   └── metrics.js        # Metrics endpoints
│   └── data/
│       ├── prds.json         # PRD data cache
│       └── stories.json      # Story data cache
├── client/
│   ├── index.html            # Main HTML
│   ├── css/
│   │   └── styles.css        # Dashboard styles
│   └── js/
│       ├── app.js            # Main app logic
│       ├── prds.js           # PRD management
│       ├── stories.js        # Story tracking
│       ├── agents.js         # Agent activity
│       └── metrics.js        # Metrics visualization
└── README.md
```

---

## Tech Stack

- **Backend**: Node.js + Express (or Python + FastAPI)
- **Frontend**: Vanilla HTML/CSS/JS (or React/Vue)
- **Data**: JSON files (or SQLite for persistence)
- **Port**: 3000 (configurable)

---

## API Endpoints

### PRDs
- `GET /api/prds` - List all PRDs
- `GET /api/prds/:id` - Get PRD details
- `POST /api/prds` - Create PRD
- `PUT /api/prds/:id` - Update PRD
- `GET /api/prds/:id/stories` - Get stories for PRD

### Stories
- `GET /api/stories` - List all stories
- `GET /api/stories/:id` - Get story details
- `PUT /api/stories/:id/status` - Update story status
- `GET /api/stories/dependencies` - Get dependency graph

### Agents
- `GET /api/agents/activity` - Get agent activity log
- `GET /api/agents/:name` - Get agent-specific activity

### Metrics
- `GET /api/metrics/summary` - Get metrics summary
- `GET /api/metrics/tokens` - Get token usage over time
- `GET /api/metrics/completion` - Get completion rates

---

## Implementation

### Server (Node.js + Express)

```javascript
// dashboard/server/index.js
const express = require('express');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

// PRD endpoints
app.get('/api/prds', async (req, res) => {
  const prds = await loadPRDs();
  res.json(prds);
});

app.get('/api/prds/:id', async (req, res) => {
  const prd = await loadPRD(req.params.id);
  res.json(prd);
});

// Story endpoints
app.get('/api/stories', async (req, res) => {
  const stories = await loadStories();
  res.json(stories);
});

// Agent activity
app.get('/api/agents/activity', async (req, res) => {
  const activity = await loadAgentActivity();
  res.json(activity);
});

// Metrics
app.get('/api/metrics/summary', async (req, res) => {
  const summary = await calculateMetrics();
  res.json(summary);
});

app.listen(PORT, () => {
  console.log(`SkillFoundry Dashboard running on http://localhost:${PORT}`);
});
```

### Client (Vanilla JS)

```javascript
// dashboard/client/js/app.js
class Dashboard {
  constructor() {
    this.apiBase = '/api';
    this.init();
  }

  async init() {
    await this.loadPRDs();
    await this.loadStories();
    await this.loadAgentActivity();
    await this.loadMetrics();
    this.render();
  }

  async loadPRDs() {
    const response = await fetch(`${this.apiBase}/prds`);
    this.prds = await response.json();
  }

  async loadStories() {
    const response = await fetch(`${this.apiBase}/stories`);
    this.stories = await response.json();
  }

  render() {
    this.renderPRDs();
    this.renderStories();
    this.renderAgentActivity();
    this.renderMetrics();
  }

  renderPRDs() {
    const container = document.getElementById('prds');
    container.innerHTML = this.prds.map(prd => `
      <div class="prd-card">
        <h3>${prd.title}</h3>
        <p>Status: ${prd.status}</p>
        <p>Stories: ${prd.storyCount}</p>
      </div>
    `).join('');
  }
}

new Dashboard();
```

---

## Usage

### Start Dashboard

```bash
# Linux/Mac
./scripts/start-dashboard.sh

# Windows
.\scripts\start-dashboard.ps1
```

### Access Dashboard

Open browser to `http://localhost:3000`

---

## Future Enhancements

- Real-time updates (WebSocket)
- Export reports (PDF/CSV)
- Dark mode
- Customizable views
- Project templates
- Integration with Git
- CI/CD status

---

**Last Updated**: January 25, 2026  
**Version**: 1.0

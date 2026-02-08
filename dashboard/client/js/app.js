/**
 * Claude AS Dashboard - Main Application Logic
 */

const API_BASE = '/api';

class Dashboard {
    constructor() {
        this.currentTab = 'overview';
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadData();
        this.render();
    }

    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // Refresh button
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.loadData();
        });

        // Create PRD button
        const createPRDBtn = document.getElementById('createPRDBtn');
        if (createPRDBtn) {
            createPRDBtn.addEventListener('click', () => {
                this.createPRD();
            });
        }

        // Story filter
        const storyFilter = document.getElementById('story-filter-status');
        if (storyFilter) {
            storyFilter.addEventListener('change', (e) => {
                this.filterStories(e.target.value);
            });
        }
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(tabName).classList.add('active');

        this.currentTab = tabName;
        this.render();
    }

    async loadData() {
        try {
            // Load summary
            const summary = await fetch(`${API_BASE}/metrics/summary`).then(r => r.json());
            this.summary = summary;

            // Load PRDs
            const prds = await fetch(`${API_BASE}/prds`).then(r => r.json());
            this.prds = prds;

            // Load stories
            const stories = await fetch(`${API_BASE}/stories`).then(r => r.json());
            this.stories = stories;

            // Load agent activity
            const activity = await fetch(`${API_BASE}/agents/activity`).then(r => r.json());
            this.activity = activity;

            // Load token metrics
            const tokens = await fetch(`${API_BASE}/metrics/tokens`).then(r => r.json());
            this.tokens = tokens;

            this.render();
        } catch (error) {
            console.error('Error loading data:', error);
        }
    }

    render() {
        if (this.currentTab === 'overview') {
            this.renderOverview();
        } else if (this.currentTab === 'prds') {
            this.renderPRDs();
        } else if (this.currentTab === 'stories') {
            this.renderStories();
        } else if (this.currentTab === 'agents') {
            this.renderAgents();
        } else if (this.currentTab === 'metrics') {
            this.renderMetrics();
        }
    }

    renderOverview() {
        if (!this.summary) return;

        // PRDs
        document.getElementById('prd-total').textContent = this.summary.prds.total;
        document.getElementById('prd-draft').textContent = this.summary.prds.draft;
        document.getElementById('prd-in-progress').textContent = this.summary.prds.inProgress;
        document.getElementById('prd-complete').textContent = this.summary.prds.complete;

        // Stories
        document.getElementById('story-total').textContent = this.summary.stories.total;
        document.getElementById('story-pending').textContent = this.summary.stories.pending;
        document.getElementById('story-in-progress').textContent = this.summary.stories.inProgress;
        document.getElementById('story-complete').textContent = this.summary.stories.complete;

        // Agents
        document.getElementById('agent-total').textContent = this.summary.agents.totalActions;
        document.getElementById('agent-unique').textContent = this.summary.agents.uniqueAgents;

        // Completion rate
        const completionRate = this.summary.stories.total > 0
            ? ((this.summary.stories.complete / this.summary.stories.total) * 100).toFixed(1)
            : 0;
        document.getElementById('completion-rate').textContent = `${completionRate}%`;
    }

    renderPRDs() {
        const container = document.getElementById('prds-list');
        if (!this.prds || this.prds.length === 0) {
            container.innerHTML = '<p>No PRDs found. Create one to get started.</p>';
            return;
        }

        container.innerHTML = this.prds.map(prd => `
            <div class="list-item">
                <h3>${prd.title || prd.id}</h3>
                <p><strong>Status:</strong> <span class="status-badge status-${prd.status}">${prd.status}</span></p>
                <p><strong>Created:</strong> ${new Date(prd.createdAt).toLocaleDateString()}</p>
                ${prd.description ? `<p>${prd.description}</p>` : ''}
            </div>
        `).join('');
    }

    renderStories() {
        const container = document.getElementById('stories-list');
        if (!this.stories || this.stories.length === 0) {
            container.innerHTML = '<p>No stories found.</p>';
            return;
        }

        const filteredStories = this.filteredStories || this.stories;

        container.innerHTML = filteredStories.map(story => `
            <div class="list-item">
                <h3>${story.id || story.title || 'Untitled Story'}</h3>
                <p><strong>Status:</strong> <span class="status-badge status-${story.status}">${story.status}</span></p>
                ${story.prdId ? `<p><strong>PRD:</strong> ${story.prdId}</p>` : ''}
                ${story.description ? `<p>${story.description}</p>` : ''}
            </div>
        `).join('');
    }

    renderAgents() {
        const container = document.getElementById('agents-list');
        if (!this.activity || this.activity.length === 0) {
            container.innerHTML = '<p>No agent activity found.</p>';
            return;
        }

        // Group by agent
        const byAgent = {};
        this.activity.forEach(action => {
            if (!byAgent[action.agent]) {
                byAgent[action.agent] = [];
            }
            byAgent[action.agent].push(action);
        });

        container.innerHTML = Object.entries(byAgent).map(([agent, actions]) => `
            <div class="list-item">
                <h3>${agent}</h3>
                <p><strong>Actions:</strong> ${actions.length}</p>
                <p><strong>Last Activity:</strong> ${new Date(actions[0].timestamp).toLocaleString()}</p>
            </div>
        `).join('');
    }

    renderMetrics() {
        // Simple metrics rendering
        // In a full implementation, you'd use a charting library like Chart.js
        const container = document.getElementById('metrics');
        container.innerHTML += `
            <div class="metric-chart">
                <h3>Token Usage</h3>
                <p>Total tokens: ${this.tokens ? this.tokens.reduce((sum, t) => sum + (t.tokens || 0), 0) : 0}</p>
            </div>
        `;
    }

    filterStories(status) {
        if (!status) {
            this.filteredStories = this.stories;
        } else {
            this.filteredStories = this.stories.filter(s => s.status === status);
        }
        this.renderStories();
    }

    async createPRD() {
        const title = prompt('PRD Title:');
        if (!title) return;

        try {
            const prd = await fetch(`${API_BASE}/prds`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, status: 'draft' })
            }).then(r => r.json());

            await this.loadData();
            this.switchTab('prds');
        } catch (error) {
            console.error('Error creating PRD:', error);
            alert('Failed to create PRD');
        }
    }
}

// Initialize dashboard when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new Dashboard();
    });
} else {
    new Dashboard();
}

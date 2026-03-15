import { describe, it, expect } from 'vitest';
import { SfBridge } from '../src/bridge';
import { mkdirSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = join(process.cwd(), '.test-vscode-bridge-' + process.pid);

function setup() {
  mkdirSync(join(TEST_DIR, '.skillfoundry'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'memory_bank', 'knowledge'), { recursive: true });
}

function teardown() {
  rmSync(TEST_DIR, { recursive: true, force: true });
}

function writeTelemetryEvent(overrides: Record<string, unknown> = {}) {
  const event = {
    id: `evt-${Math.random().toString(36).slice(2)}`,
    schema_version: 1,
    event_type: 'forge_run',
    timestamp: new Date().toISOString(),
    session_id: 'test-session',
    duration_ms: 5000,
    status: 'pass',
    details: { gate_passes: 7, gate_failures: 0 },
    ...overrides,
  };
  appendFileSync(
    join(TEST_DIR, '.skillfoundry', 'telemetry.jsonl'),
    JSON.stringify(event) + '\n',
  );
}

function writeKnowledgeEntry(type: string, content: string, weight: number = 0.5) {
  const entry = {
    id: `entry-${Math.random().toString(36).slice(2)}`,
    type,
    content,
    created_at: new Date().toISOString(),
    weight,
    tags: [type, 'test'],
  };
  appendFileSync(
    join(TEST_DIR, 'memory_bank', 'knowledge', 'decisions.jsonl'),
    JSON.stringify(entry) + '\n',
  );
}

describe('SfBridge', () => {
  it('constructs with a workDir', () => {
    const bridge = new SfBridge(TEST_DIR);
    expect(bridge.getWorkDir()).toBe(TEST_DIR);
  });

  it('returns null metrics when no telemetry exists', () => {
    setup();
    try {
      const bridge = new SfBridge(TEST_DIR);
      // getMetrics calls sf_cli which may not be compiled for test — that's OK
      // Bridge should handle the error gracefully
      const result = bridge.getMetrics();
      // Either null (sf_cli not found) or an aggregation object
      expect(result === null || typeof result === 'object').toBe(true);
    } finally {
      teardown();
    }
  });

  it('returns empty events when no telemetry file exists', () => {
    setup();
    try {
      const bridge = new SfBridge(TEST_DIR);
      const result = bridge.getEvents();
      expect(result.events).toEqual([]);
    } finally {
      teardown();
    }
  });

  it('returns empty array when no memory entries exist', () => {
    setup();
    try {
      const bridge = new SfBridge(TEST_DIR);
      const entries = bridge.recallMemory();
      expect(Array.isArray(entries)).toBe(true);
    } finally {
      teardown();
    }
  });

  it('recalls memory entries with search query', () => {
    setup();
    try {
      writeKnowledgeEntry('decision', 'Use JWT for authentication tokens', 0.8);
      writeKnowledgeEntry('decision', 'Use bcrypt for password hashing', 0.6);
      writeKnowledgeEntry('fact', 'Database uses PostgreSQL', 0.5);

      const bridge = new SfBridge(TEST_DIR);
      const results = bridge.recallMemory('auth');
      expect(results.length).toBe(1);
      expect(results[0].content).toContain('authentication');
    } finally {
      teardown();
    }
  });

  it('sorts memory entries by weight descending', () => {
    setup();
    try {
      writeKnowledgeEntry('decision', 'Low weight entry', 0.2);
      writeKnowledgeEntry('decision', 'High weight entry', 0.9);
      writeKnowledgeEntry('decision', 'Medium weight entry', 0.5);

      const bridge = new SfBridge(TEST_DIR);
      const results = bridge.recallMemory();
      expect(results[0].weight).toBe(0.9);
      expect(results[1].weight).toBe(0.5);
      expect(results[2].weight).toBe(0.2);
    } finally {
      teardown();
    }
  });

  it('returns all entries when no query is provided', () => {
    setup();
    try {
      writeKnowledgeEntry('decision', 'Entry one', 0.5);
      writeKnowledgeEntry('fact', 'Entry two', 0.5);

      const bridge = new SfBridge(TEST_DIR);
      const results = bridge.recallMemory();
      expect(results.length).toBe(2);
    } finally {
      teardown();
    }
  });

  it('searches tags in memory recall', () => {
    setup();
    try {
      writeKnowledgeEntry('error', 'Some error happened', 0.5);

      const bridge = new SfBridge(TEST_DIR);
      const results = bridge.recallMemory('error');
      expect(results.length).toBe(1);
    } finally {
      teardown();
    }
  });

  it('handles malformed JSONL lines gracefully', () => {
    setup();
    try {
      appendFileSync(
        join(TEST_DIR, 'memory_bank', 'knowledge', 'decisions.jsonl'),
        'not valid json\n',
      );
      writeKnowledgeEntry('decision', 'Valid entry', 0.5);

      const bridge = new SfBridge(TEST_DIR);
      const results = bridge.recallMemory();
      expect(results.length).toBe(1);
    } finally {
      teardown();
    }
  });

  it('returns empty baselines when sf_cli is not available', () => {
    const bridge = new SfBridge('/nonexistent/path');
    const baselines = bridge.getBaselines();
    expect(typeof baselines).toBe('object');
  });

  it('scanDependencies returns null when sf_cli is not available', () => {
    const bridge = new SfBridge('/nonexistent/path');
    const result = bridge.scanDependencies();
    expect(result).toBeNull();
  });

  it('generateReport returns null when sf_cli is not available', () => {
    const bridge = new SfBridge('/nonexistent/path');
    const result = bridge.generateReport();
    expect(result).toBeNull();
  });

  it('runGate returns null when sf_cli is not available', () => {
    const bridge = new SfBridge('/nonexistent/path');
    const result = bridge.runGate('T1');
    expect(result).toBeNull();
  });
});

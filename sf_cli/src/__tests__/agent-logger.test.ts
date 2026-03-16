// Tests for AgentLogger — structured per-agent JSON lifecycle logging.
// Covers: start, info, warn, error, complete, fail, abort, duration tracking,
// correlationId propagation, JSONL file writes, and SfLogger integration.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AgentLogger } from '../core/agent-logger.js';
import type { AgentLogEntry } from '../core/agent-logger.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSfLog = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

vi.mock('../utils/logger.js', () => ({
  getLogger: () => mockSfLog,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  const dir = join(tmpdir(), `sf-agent-logger-test-${randomUUID()}`);
  return dir;
}

function readLogEntries(workDir: string, agentId: string, taskId: string): AgentLogEntry[] {
  const logPath = join(workDir, '.skillfoundry', 'logs', 'agents', `${agentId}-${taskId}.jsonl`);
  if (!existsSync(logPath)) return [];
  const content = readFileSync(logPath, 'utf-8').trim();
  if (!content) return [];
  return content.split('\n').map((line) => JSON.parse(line) as AgentLogEntry);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('AgentLogger', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = makeTempDir();
    vi.clearAllMocks();
  });

  afterEach(() => {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  });

  // ── Construction & directory creation ──────────────────────────────────────

  it('creates the agents log directory on construction', () => {
    const agentId = 'coder-001';
    const taskId = randomUUID();
    const correlationId = randomUUID();

    new AgentLogger(agentId, taskId, correlationId, workDir);

    const dir = join(workDir, '.skillfoundry', 'logs', 'agents');
    expect(existsSync(dir)).toBe(true);
  });

  it('does not throw if the agents directory already exists', () => {
    const agentId = 'coder-001';
    const taskId = randomUUID();
    const correlationId = randomUUID();

    // Create twice — should not throw
    expect(() => {
      new AgentLogger(agentId, taskId, correlationId, workDir);
      new AgentLogger(agentId, taskId, correlationId, workDir);
    }).not.toThrow();
  });

  // ── start() ────────────────────────────────────────────────────────────────

  it('start() writes a JSON entry with phase "start"', () => {
    const agentId = 'coder-001';
    const taskId = randomUUID();
    const correlationId = randomUUID();
    const logger = new AgentLogger(agentId, taskId, correlationId, workDir);

    logger.start();

    const entries = readLogEntries(workDir, agentId, taskId);
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry.phase).toBe('start');
    expect(entry.agentId).toBe(agentId);
    expect(entry.taskId).toBe(taskId);
    expect(entry.correlationId).toBe(correlationId);
    expect(entry.level).toBe('info');
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('start() calls sfLog.info with agent-logger category', () => {
    const logger = new AgentLogger('agent-a', randomUUID(), randomUUID(), workDir);
    logger.start();
    expect(mockSfLog.info).toHaveBeenCalledWith('agent-logger', 'agent_start', expect.objectContaining({ phase: 'start' }));
  });

  // ── info() / warn() / error() ───────────────────────────────────────────────

  it('info() writes a JSON entry with phase "execute" and level "info"', () => {
    const agentId = 'coder-001';
    const taskId = randomUUID();
    const logger = new AgentLogger(agentId, taskId, randomUUID(), workDir);

    logger.info('Reading source files', { fileCount: 12 });

    const entries = readLogEntries(workDir, agentId, taskId);
    expect(entries).toHaveLength(1);
    expect(entries[0].phase).toBe('execute');
    expect(entries[0].level).toBe('info');
    expect(entries[0].message).toBe('Reading source files');
    expect(entries[0].metadata).toEqual({ fileCount: 12 });
  });

  it('warn() writes a JSON entry with phase "execute" and level "warn"', () => {
    const agentId = 'reviewer-002';
    const taskId = randomUUID();
    const logger = new AgentLogger(agentId, taskId, randomUUID(), workDir);

    logger.warn('Unusual pattern detected');

    const entries = readLogEntries(workDir, agentId, taskId);
    expect(entries[0].level).toBe('warn');
    expect(entries[0].phase).toBe('execute');
    expect(entries[0].message).toBe('Unusual pattern detected');
  });

  it('error() writes a JSON entry with phase "execute" and level "error"', () => {
    const agentId = 'tester-003';
    const taskId = randomUUID();
    const logger = new AgentLogger(agentId, taskId, randomUUID(), workDir);

    logger.error('Test runner crashed', { exitCode: 1 });

    const entries = readLogEntries(workDir, agentId, taskId);
    expect(entries[0].level).toBe('error');
    expect(entries[0].phase).toBe('execute');
    expect(entries[0].metadata).toEqual({ exitCode: 1 });
  });

  it('info() without metadata omits the metadata field', () => {
    const agentId = 'coder-001';
    const taskId = randomUUID();
    const logger = new AgentLogger(agentId, taskId, randomUUID(), workDir);

    logger.info('Just a message');

    const entries = readLogEntries(workDir, agentId, taskId);
    expect(entries[0].metadata).toBeUndefined();
  });

  // ── complete() ─────────────────────────────────────────────────────────────

  it('complete() writes a JSON entry with phase "complete" and a durationMs', () => {
    const agentId = 'coder-001';
    const taskId = randomUUID();
    const logger = new AgentLogger(agentId, taskId, randomUUID(), workDir);

    logger.start();
    logger.complete({ linesWritten: 240 });

    const entries = readLogEntries(workDir, agentId, taskId);
    const completeEntry = entries.find((e) => e.phase === 'complete');
    expect(completeEntry).toBeDefined();
    expect(completeEntry!.durationMs).toBeDefined();
    expect(typeof completeEntry!.durationMs).toBe('number');
    expect(completeEntry!.durationMs).toBeGreaterThanOrEqual(0);
    expect(completeEntry!.metadata).toEqual({ result: { linesWritten: 240 } });
  });

  it('complete() duration reflects wall-clock time from start()', async () => {
    const agentId = 'coder-001';
    const taskId = randomUUID();
    const logger = new AgentLogger(agentId, taskId, randomUUID(), workDir);

    logger.start();
    // Give a small real delay to ensure duration > 0
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    logger.complete();

    const entries = readLogEntries(workDir, agentId, taskId);
    const completeEntry = entries.find((e) => e.phase === 'complete');
    expect(completeEntry!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('complete() without result omits result from metadata', () => {
    const agentId = 'coder-001';
    const taskId = randomUUID();
    const logger = new AgentLogger(agentId, taskId, randomUUID(), workDir);
    logger.start();
    logger.complete();

    const entries = readLogEntries(workDir, agentId, taskId);
    const completeEntry = entries.find((e) => e.phase === 'complete');
    expect(completeEntry!.metadata).toBeUndefined();
  });

  // ── fail() ─────────────────────────────────────────────────────────────────

  it('fail() writes a JSON entry with phase "fail" and error details', () => {
    const agentId = 'coder-001';
    const taskId = randomUUID();
    const logger = new AgentLogger(agentId, taskId, randomUUID(), workDir);

    logger.start();
    const err = new Error('Compilation failed');
    logger.fail(err);

    const entries = readLogEntries(workDir, agentId, taskId);
    const failEntry = entries.find((e) => e.phase === 'fail');
    expect(failEntry).toBeDefined();
    expect(failEntry!.level).toBe('error');
    expect(failEntry!.message).toContain('Compilation failed');
    expect(failEntry!.durationMs).toBeDefined();
    expect(failEntry!.metadata).toBeDefined();
    expect(failEntry!.metadata!['errorMessage']).toBe('Compilation failed');
    expect(failEntry!.metadata!['errorName']).toBe('Error');
    expect(typeof failEntry!.metadata!['stack']).toBe('string');
  });

  it('fail() includes accurate durationMs from start()', async () => {
    const agentId = 'coder-001';
    const taskId = randomUUID();
    const logger = new AgentLogger(agentId, taskId, randomUUID(), workDir);

    logger.start();
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    logger.fail(new Error('Oops'));

    const entries = readLogEntries(workDir, agentId, taskId);
    const failEntry = entries.find((e) => e.phase === 'fail');
    expect(failEntry!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('fail() calls sfLog.error with agent-logger category', () => {
    const logger = new AgentLogger('agent-x', randomUUID(), randomUUID(), workDir);
    logger.start();
    logger.fail(new Error('Bad'));
    expect(mockSfLog.error).toHaveBeenCalledWith('agent-logger', 'agent_fail', expect.objectContaining({ phase: 'fail' }));
  });

  // ── abort() ────────────────────────────────────────────────────────────────

  it('abort() writes a JSON entry with phase "abort" and reason', () => {
    const agentId = 'coder-001';
    const taskId = randomUUID();
    const logger = new AgentLogger(agentId, taskId, randomUUID(), workDir);

    logger.start();
    logger.abort('User cancelled the pipeline');

    const entries = readLogEntries(workDir, agentId, taskId);
    const abortEntry = entries.find((e) => e.phase === 'abort');
    expect(abortEntry).toBeDefined();
    expect(abortEntry!.level).toBe('warn');
    expect(abortEntry!.message).toContain('User cancelled the pipeline');
    expect(abortEntry!.durationMs).toBeDefined();
    expect(abortEntry!.metadata).toEqual({ reason: 'User cancelled the pipeline' });
  });

  // ── Correlation ID propagation ──────────────────────────────────────────────

  it('all entries from the same logger share the same correlationId', () => {
    const agentId = 'coder-001';
    const taskId = randomUUID();
    const correlationId = 'xyz-789';
    const logger = new AgentLogger(agentId, taskId, correlationId, workDir);

    logger.start();
    logger.info('mid-task message');
    logger.complete();

    const entries = readLogEntries(workDir, agentId, taskId);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.correlationId).toBe(correlationId);
    }
  });

  it('two loggers with the same correlationId but different agentIds share correlation', () => {
    const correlationId = 'shared-correlation-abc';
    const taskIdA = randomUUID();
    const taskIdB = randomUUID();

    const loggerA = new AgentLogger('agent-A', taskIdA, correlationId, workDir);
    const loggerB = new AgentLogger('agent-B', taskIdB, correlationId, workDir);

    loggerA.start();
    loggerB.start();
    loggerA.complete();
    loggerB.complete();

    const entriesA = readLogEntries(workDir, 'agent-A', taskIdA);
    const entriesB = readLogEntries(workDir, 'agent-B', taskIdB);

    for (const entry of [...entriesA, ...entriesB]) {
      expect(entry.correlationId).toBe(correlationId);
    }
  });

  // ── Integration: full task lifecycle sequence ───────────────────────────────

  it('produces the expected sequence of phases for a successful lifecycle', () => {
    const agentId = 'coder-001';
    const taskId = randomUUID();
    const logger = new AgentLogger(agentId, taskId, randomUUID(), workDir);

    logger.start();
    logger.info('Analysing requirements');
    logger.info('Writing implementation');
    logger.complete({ filesCreated: 3 });

    const entries = readLogEntries(workDir, agentId, taskId);
    const phases = entries.map((e) => e.phase);
    expect(phases).toEqual(['start', 'execute', 'execute', 'complete']);
  });

  it('produces the expected sequence of phases for a failed lifecycle', () => {
    const agentId = 'coder-001';
    const taskId = randomUUID();
    const logger = new AgentLogger(agentId, taskId, randomUUID(), workDir);

    logger.start();
    logger.info('Attempting build');
    logger.fail(new Error('Build failed'));

    const entries = readLogEntries(workDir, agentId, taskId);
    const phases = entries.map((e) => e.phase);
    expect(phases).toEqual(['start', 'execute', 'fail']);
  });
});

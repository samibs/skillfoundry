import { describe, it, expect, beforeEach } from 'vitest';
import { ReactGate } from '../core/react-gate.js';

describe('ReactGate', () => {
  let gate: ReactGate;

  beforeEach(() => {
    gate = new ReactGate();
  });

  describe('gated agents', () => {
    it('blocks coder write without prior reads', () => {
      const result = gate.checkToolCall('coder', 'Edit');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('ReACT gate');
      expect(result.reason).toContain('0 read(s)');
    });

    it('blocks secure-coder write without prior reads', () => {
      const result = gate.checkToolCall('secure-coder', 'Write');
      expect(result.allowed).toBe(false);
    });

    it('blocks data-architect write without prior reads', () => {
      const result = gate.checkToolCall('data-architect', 'Edit');
      expect(result.allowed).toBe(false);
    });

    it('blocks refactor write without prior reads', () => {
      const result = gate.checkToolCall('refactor', 'Write');
      expect(result.allowed).toBe(false);
    });

    it('allows write after sufficient reads', () => {
      gate.checkToolCall('coder', 'Read');
      gate.checkToolCall('coder', 'Grep');
      const result = gate.checkToolCall('coder', 'Edit');
      expect(result.allowed).toBe(true);
    });

    it('blocks write after only 1 read (minimum is 2)', () => {
      gate.checkToolCall('coder', 'Read');
      const result = gate.checkToolCall('coder', 'Edit');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('1 read(s)');
    });

    it('allows multiple writes after meeting read threshold', () => {
      gate.checkToolCall('coder', 'Read');
      gate.checkToolCall('coder', 'Glob');
      expect(gate.checkToolCall('coder', 'Edit').allowed).toBe(true);
      expect(gate.checkToolCall('coder', 'Write').allowed).toBe(true);
    });

    it('counts Bash as a read operation', () => {
      gate.checkToolCall('coder', 'Read');
      gate.checkToolCall('coder', 'Bash');
      expect(gate.checkToolCall('coder', 'Edit').allowed).toBe(true);
    });

    it('always allows read operations', () => {
      expect(gate.checkToolCall('coder', 'Read').allowed).toBe(true);
      expect(gate.checkToolCall('coder', 'Grep').allowed).toBe(true);
      expect(gate.checkToolCall('coder', 'Glob').allowed).toBe(true);
    });

    it('passes through non-read/non-write tools', () => {
      expect(gate.checkToolCall('coder', 'Agent').allowed).toBe(true);
      expect(gate.checkToolCall('coder', 'WebSearch').allowed).toBe(true);
    });
  });

  describe('non-gated agents', () => {
    it('allows tester to write without reads', () => {
      expect(gate.checkToolCall('tester', 'Write').allowed).toBe(true);
    });

    it('allows docs to write without reads', () => {
      expect(gate.checkToolCall('docs', 'Write').allowed).toBe(true);
    });

    it('allows ops to write without reads', () => {
      expect(gate.checkToolCall('ops', 'Edit').allowed).toBe(true);
    });

    it('allows unknown agents to write freely', () => {
      expect(gate.checkToolCall('unknown-agent', 'Write').allowed).toBe(true);
    });
  });

  describe('stats tracking', () => {
    it('tracks reads and writes', () => {
      gate.checkToolCall('coder', 'Read');
      gate.checkToolCall('coder', 'Grep');
      gate.checkToolCall('coder', 'Edit');

      const stats = gate.getStats('coder');
      expect(stats).toBeDefined();
      expect(stats!.reads).toBe(2);
      expect(stats!.writes).toBe(1);
      expect(stats!.firstWriteAt).toBe(2);
    });

    it('tracks blocked attempts', () => {
      gate.checkToolCall('coder', 'Edit');
      gate.checkToolCall('coder', 'Write');

      const stats = gate.getStats('coder');
      expect(stats!.gateBlocked).toBe(2);
      expect(stats!.writes).toBe(0);
    });

    it('returns undefined for unknown agents', () => {
      expect(gate.getStats('nonexistent')).toBeUndefined();
    });
  });

  describe('summary', () => {
    it('reports compliance for all tracked agents', () => {
      gate.checkToolCall('coder', 'Read');
      gate.checkToolCall('coder', 'Grep');
      gate.checkToolCall('coder', 'Edit');

      gate.checkToolCall('refactor', 'Edit'); // blocked

      const summary = gate.getSummary();
      expect(summary).toHaveLength(2);

      const coder = summary.find((s) => s.agent === 'coder');
      expect(coder?.compliant).toBe(true);

      const refactor = summary.find((s) => s.agent === 'refactor');
      expect(refactor?.compliant).toBe(false);
      expect(refactor?.blocked).toBe(1);
    });
  });

  describe('resetForStory', () => {
    it('clears all agent stats', () => {
      gate.checkToolCall('coder', 'Read');
      gate.checkToolCall('coder', 'Read');
      gate.checkToolCall('coder', 'Edit');

      gate.resetForStory();

      expect(gate.getStats('coder')).toBeUndefined();
      // After reset, writes should be blocked again
      expect(gate.checkToolCall('coder', 'Edit').allowed).toBe(false);
    });
  });

  describe('custom config', () => {
    it('respects custom minimum reads', () => {
      const strict = new ReactGate({ minimumReads: 3 });
      strict.checkToolCall('coder', 'Read');
      strict.checkToolCall('coder', 'Grep');
      expect(strict.checkToolCall('coder', 'Edit').allowed).toBe(false);

      strict.checkToolCall('coder', 'Glob');
      expect(strict.checkToolCall('coder', 'Edit').allowed).toBe(true);
    });

    it('respects custom gated agents', () => {
      const custom = new ReactGate({
        gatedAgents: new Set(['tester']),
      });
      // Tester is now gated
      expect(custom.checkToolCall('tester', 'Write').allowed).toBe(false);
      // Coder is NOT gated
      expect(custom.checkToolCall('coder', 'Write').allowed).toBe(true);
    });
  });
});

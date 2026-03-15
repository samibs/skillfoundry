import { describe, it, expect, beforeEach } from 'vitest';
import { DecisionTrail, getDecisionTrail, resetDecisionTrail } from '../core/decision-trail.js';

describe('DecisionTrail', () => {
  let trail: DecisionTrail;

  beforeEach(() => {
    trail = new DecisionTrail();
  });

  describe('record', () => {
    it('records a decision entry', () => {
      trail.record('coder', 'implement auth', ['JWT', 'session'], 'JWT', 'stateless is simpler');
      expect(trail.size).toBe(1);
    });

    it('evicts oldest when over capacity', () => {
      const small = new DecisionTrail(3);
      small.record('a1', 'act1', [], 'c1', 'r1');
      small.record('a2', 'act2', [], 'c2', 'r2');
      small.record('a3', 'act3', [], 'c3', 'r3');
      small.record('a4', 'act4', [], 'c4', 'r4');

      expect(small.size).toBe(3);
      const all = small.getLast(10);
      expect(all[0].agent).toBe('a2'); // a1 was evicted
    });
  });

  describe('getLast', () => {
    it('returns last N entries', () => {
      trail.record('coder', 'act1', [], 'c1', 'r1');
      trail.record('coder', 'act2', [], 'c2', 'r2');
      trail.record('coder', 'act3', [], 'c3', 'r3');

      const last2 = trail.getLast(2);
      expect(last2).toHaveLength(2);
      expect(last2[0].action).toBe('act2');
      expect(last2[1].action).toBe('act3');
    });

    it('returns all when fewer than requested', () => {
      trail.record('coder', 'act1', [], 'c1', 'r1');
      expect(trail.getLast(10)).toHaveLength(1);
    });

    it('defaults to 5', () => {
      for (let i = 0; i < 8; i++) {
        trail.record('coder', `act${i}`, [], `c${i}`, `r${i}`);
      }
      expect(trail.getLast()).toHaveLength(5);
    });
  });

  describe('getByAgent', () => {
    it('filters by agent name', () => {
      trail.record('coder', 'code it', [], 'x', 'y');
      trail.record('tester', 'test it', [], 'x', 'y');
      trail.record('coder', 'refine it', [], 'x', 'y');

      const coderEntries = trail.getByAgent('coder');
      expect(coderEntries).toHaveLength(2);
      expect(coderEntries[0].action).toBe('code it');
      expect(coderEntries[1].action).toBe('refine it');
    });

    it('returns empty for unknown agent', () => {
      trail.record('coder', 'act', [], 'x', 'y');
      expect(trail.getByAgent('unknown')).toHaveLength(0);
    });

    it('respects count limit', () => {
      trail.record('coder', 'act1', [], 'x', 'y');
      trail.record('coder', 'act2', [], 'x', 'y');
      trail.record('coder', 'act3', [], 'x', 'y');

      expect(trail.getByAgent('coder', 2)).toHaveLength(2);
    });
  });

  describe('getLastActiveAgent', () => {
    it('returns null when empty', () => {
      expect(trail.getLastActiveAgent()).toBeNull();
    });

    it('returns the most recent agent', () => {
      trail.record('coder', 'act1', [], 'x', 'y');
      trail.record('tester', 'act2', [], 'x', 'y');
      expect(trail.getLastActiveAgent()).toBe('tester');
    });
  });

  describe('formatForDisplay', () => {
    it('returns empty message when no decisions', () => {
      expect(trail.formatForDisplay()).toContain('No decisions recorded');
    });

    it('formats decision entries as markdown', () => {
      trail.record(
        'coder',
        'choose database',
        ['PostgreSQL', 'SQLite', 'MongoDB'],
        'PostgreSQL',
        'Need ACID compliance and relational queries',
      );

      const output = trail.formatForDisplay();
      expect(output).toContain('## Decision Trail');
      expect(output).toContain('coder');
      expect(output).toContain('choose database');
      expect(output).toContain('PostgreSQL');
      expect(output).toContain('SQLite');
      expect(output).toContain('MongoDB');
      expect(output).toContain('ACID compliance');
    });

    it('accepts custom entry list', () => {
      trail.record('a', 'act1', [], 'x', 'y');
      trail.record('b', 'act2', [], 'x', 'y');

      const output = trail.formatForDisplay(trail.getByAgent('a'));
      expect(output).toContain('act1');
      expect(output).not.toContain('act2');
    });
  });

  describe('clear', () => {
    it('removes all entries', () => {
      trail.record('coder', 'act', [], 'x', 'y');
      trail.clear();
      expect(trail.size).toBe(0);
    });
  });
});

describe('singleton', () => {
  beforeEach(() => {
    resetDecisionTrail();
  });

  it('returns same instance', () => {
    const t1 = getDecisionTrail();
    const t2 = getDecisionTrail();
    expect(t1).toBe(t2);
  });

  it('resets to new instance', () => {
    const t1 = getDecisionTrail();
    t1.record('coder', 'act', [], 'x', 'y');
    resetDecisionTrail();
    const t2 = getDecisionTrail();
    expect(t2.size).toBe(0);
  });
});

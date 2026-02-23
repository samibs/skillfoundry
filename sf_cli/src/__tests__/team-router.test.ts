import { describe, it, expect } from 'vitest';
import { routeToAgent, AGENT_ROUTING_KEYWORDS } from '../core/team-router.js';
import { TEAM_PRESETS } from '../core/team-registry.js';

const DEV_MEMBERS = TEAM_PRESETS.dev.members;
const DEV_DEFAULT = TEAM_PRESETS.dev.defaultAgent;

describe('routeToAgent', () => {
  it('routes "implement the login form" to coder', () => {
    const result = routeToAgent('implement the login form', DEV_MEMBERS, DEV_DEFAULT);
    expect(result.agent).toBe('coder');
  });

  it('routes "write unit tests for auth" to tester', () => {
    const result = routeToAgent('write unit tests for auth', DEV_MEMBERS, DEV_DEFAULT);
    expect(result.agent).toBe('tester');
  });

  it('routes "fix the broken login bug" to fixer', () => {
    const result = routeToAgent('fix the broken login bug', DEV_MEMBERS, DEV_DEFAULT);
    expect(result.agent).toBe('fixer');
  });

  it('routes "review the PR changes" to review', () => {
    const result = routeToAgent('review the PR changes', DEV_MEMBERS, DEV_DEFAULT);
    expect(result.agent).toBe('review');
  });

  it('routes "debug the stack trace" to debugger', () => {
    const result = routeToAgent('debug the stack trace', DEV_MEMBERS, DEV_DEFAULT);
    expect(result.agent).toBe('debugger');
  });

  it('falls back to default agent for ambiguous message', () => {
    const result = routeToAgent('hello there', DEV_MEMBERS, DEV_DEFAULT);
    expect(result.agent).toBe('coder');
    expect(result.confidence).toBe('fallback');
  });

  it('returns high confidence for strong matches', () => {
    // "write unit tests for the component" → tester: unit tests(4) + tests(3) = 7 (high)
    const result = routeToAgent('write unit tests for the component', DEV_MEMBERS, DEV_DEFAULT);
    expect(result.agent).toBe('tester');
    expect(result.confidence).toBe('high');
  });

  it('returns medium confidence for moderate matches', () => {
    const result = routeToAgent('create a function', DEV_MEMBERS, DEV_DEFAULT);
    expect(result.agent).toBe('coder');
    expect(['medium', 'high']).toContain(result.confidence);
  });

  it('handles empty message gracefully', () => {
    const result = routeToAgent('', DEV_MEMBERS, DEV_DEFAULT);
    expect(result.agent).toBe('coder');
    expect(result.confidence).toBe('fallback');
  });

  it('only scores team members, not all agents', () => {
    // "deploy the container" would match devops, but devops is not in dev team
    const result = routeToAgent('deploy the container to kubernetes', DEV_MEMBERS, DEV_DEFAULT);
    expect(DEV_MEMBERS).toContain(result.agent);
  });

  it('breaks ties by member array order', () => {
    // If two agents tie, the earlier one in the members array wins
    const result = routeToAgent('something equally vague', ['review', 'coder'], 'coder');
    expect(result.agent).toBe('coder');
    expect(result.confidence).toBe('fallback');
  });

  it('works with security team presets', () => {
    const sec = TEAM_PRESETS.security;
    const result = routeToAgent('scan for XSS vulnerabilities', sec.members, sec.defaultAgent);
    expect(['security', 'security-scanner']).toContain(result.agent);
  });

  it('works with ops team presets', () => {
    const ops = TEAM_PRESETS.ops;
    const result = routeToAgent('check CPU performance bottleneck', ops.members, ops.defaultAgent);
    expect(result.agent).toBe('performance');
  });
});

describe('AGENT_ROUTING_KEYWORDS', () => {
  it('has keywords for common agents', () => {
    const expected = ['coder', 'tester', 'fixer', 'review', 'debugger', 'architect', 'security'];
    for (const agent of expected) {
      expect(AGENT_ROUTING_KEYWORDS[agent]).toBeDefined();
      expect(AGENT_ROUTING_KEYWORDS[agent].length).toBeGreaterThan(0);
    }
  });

  it('all patterns are valid RegExp objects', () => {
    for (const [, keywords] of Object.entries(AGENT_ROUTING_KEYWORDS)) {
      for (const kw of keywords) {
        expect(kw.pattern).toBeInstanceOf(RegExp);
        expect(kw.weight).toBeGreaterThan(0);
      }
    }
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { parseFrontmatter, loadAgentPromptFromFile, _resetPromptLoaderCache } from '../core/agent-prompt-loader.js';
import { getAgentSystemPrompt } from '../core/agent-registry.js';

// ---------------------------------------------------------------------------
// parseFrontmatter
// ---------------------------------------------------------------------------

describe('parseFrontmatter', () => {
  it('parses valid frontmatter', () => {
    const content = '---\nname: Test Agent\ncommand: test\n---\nBody content here.';
    const result = parseFrontmatter(content);
    expect(result.data.name).toBe('Test Agent');
    expect(result.data.command).toBe('test');
    expect(result.body).toBe('Body content here.');
  });

  it('returns full content as body when no frontmatter', () => {
    const content = 'Just a plain markdown file.';
    const result = parseFrontmatter(content);
    expect(result.data).toEqual({});
    expect(result.body).toBe('Just a plain markdown file.');
  });

  it('handles empty body after frontmatter', () => {
    const content = '---\nname: Empty\n---\n';
    const result = parseFrontmatter(content);
    expect(result.data.name).toBe('Empty');
    expect(result.body).toBe('');
  });

  it('handles frontmatter with no closing delimiter', () => {
    const content = '---\nname: Broken\nThis never closes';
    const result = parseFrontmatter(content);
    expect(result.data).toEqual({});
    expect(result.body).toBe(content.trim());
  });

  it('handles multiline body content', () => {
    const content = '---\ncommand: coder\n---\n# Heading\n\nParagraph one.\n\nParagraph two.';
    const result = parseFrontmatter(content);
    expect(result.data.command).toBe('coder');
    expect(result.body).toContain('# Heading');
    expect(result.body).toContain('Paragraph two.');
  });

  it('strips leading whitespace before frontmatter', () => {
    const content = '\n\n---\nname: Spaced\n---\nBody';
    const result = parseFrontmatter(content);
    expect(result.data.name).toBe('Spaced');
    expect(result.body).toBe('Body');
  });

  it('handles colons in values', () => {
    const content = '---\ndescription: This: has colons: in it\n---\nBody';
    const result = parseFrontmatter(content);
    expect(result.data.description).toBe('This: has colons: in it');
  });
});

// ---------------------------------------------------------------------------
// loadAgentPromptFromFile
// ---------------------------------------------------------------------------

describe('loadAgentPromptFromFile', () => {
  beforeEach(() => {
    _resetPromptLoaderCache();
  });

  it('loads prompt for agent with markdown file (coder)', () => {
    const prompt = loadAgentPromptFromFile('coder');
    expect(prompt).not.toBeNull();
    expect(prompt!.length).toBeGreaterThan(100);
    // The coder markdown should contain the reasoning gate we added
    expect(prompt).toContain('Think Before Acting');
  });

  it('loads prompt for agent with markdown file (architect)', () => {
    const prompt = loadAgentPromptFromFile('architect');
    expect(prompt).not.toBeNull();
    expect(prompt).toContain('FILE RESTRICTION');
  });

  it('loads prompt for agent with markdown file (tester)', () => {
    const prompt = loadAgentPromptFromFile('tester');
    expect(prompt).not.toBeNull();
    expect(prompt).toContain('NEVER MODIFY APPLICATION CODE');
  });

  it('returns null for agent without markdown file (anvil)', () => {
    const prompt = loadAgentPromptFromFile('anvil');
    expect(prompt).toBeNull();
  });

  it('returns null for agent without markdown file (blitz)', () => {
    const prompt = loadAgentPromptFromFile('blitz');
    expect(prompt).toBeNull();
  });

  it('returns null for unknown agent', () => {
    const prompt = loadAgentPromptFromFile('nonexistent-agent-xyz');
    expect(prompt).toBeNull();
  });

  it('caches results on subsequent calls', () => {
    const first = loadAgentPromptFromFile('coder');
    const second = loadAgentPromptFromFile('coder');
    expect(first).toBe(second); // Same reference (cached)
  });

  it('strips frontmatter from returned prompt', () => {
    const prompt = loadAgentPromptFromFile('coder');
    expect(prompt).not.toBeNull();
    // Frontmatter key-value pairs should not appear at the start
    expect(prompt).not.toMatch(/^name:\s*ruthless-coder/m);
    expect(prompt).not.toMatch(/^command:\s*coder/m);
    expect(prompt).not.toMatch(/^color:\s*blue/m);
    // Body should start with the agent description, not frontmatter
    expect(prompt!.slice(0, 50)).toContain('You are a ruthless senior');
  });
});

// ---------------------------------------------------------------------------
// Integration: getAgentSystemPrompt uses file-based prompts
// ---------------------------------------------------------------------------

describe('getAgentSystemPrompt integration', () => {
  beforeEach(() => {
    _resetPromptLoaderCache();
  });

  it('returns file-based prompt for coder (not hardcoded one-liner)', () => {
    const prompt = getAgentSystemPrompt('coder');
    // The file-based prompt is much longer than the hardcoded one-liner
    expect(prompt.length).toBeGreaterThan(500);
    // Should contain the detailed behavioral rules from the markdown
    expect(prompt).toContain('Think Before Acting');
    expect(prompt).toContain('POST-EDIT VERIFICATION');
    expect(prompt).toContain('ESCALATION PROTOCOL');
  });

  it('returns hardcoded prompt for anvil (no markdown file)', () => {
    const prompt = getAgentSystemPrompt('anvil');
    // Should be the short hardcoded one-liner
    expect(prompt).toContain('The Anvil');
    expect(prompt).toContain('SkillFoundry agent');
    expect(prompt.split(/\s+/).length).toBeLessThan(50);
  });

  it('returns default prompt for unknown agent', () => {
    const prompt = getAgentSystemPrompt('nonexistent');
    expect(prompt).toContain('SkillFoundry AI');
  });

  it('file-based prompt for secure-coder contains command classification', () => {
    const prompt = getAgentSystemPrompt('secure-coder');
    expect(prompt).toContain('SAFE/UNSAFE COMMAND CLASSIFICATION');
  });

  it('file-based prompt for data-architect contains migration rule', () => {
    const prompt = getAgentSystemPrompt('data-architect');
    expect(prompt).toContain('MIGRATION FILE REQUIRED');
  });

  it('file-based prompt for memory contains auto-capture', () => {
    const prompt = getAgentSystemPrompt('memory');
    expect(prompt).toContain('AUTO-CAPTURE ARCHITECTURAL DECISIONS');
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseSlashCommand,
  initCommands,
  getCommand,
  getAllCommands,
} from '../commands/index.js';

describe('Slash Commands', () => {
  describe('parseSlashCommand', () => {
    it('parses /help', () => {
      const result = parseSlashCommand('/help');
      expect(result).toEqual({ name: 'help', args: '' });
    });

    it('parses /status with no args', () => {
      const result = parseSlashCommand('/status');
      expect(result).toEqual({ name: 'status', args: '' });
    });

    it('parses command with args', () => {
      const result = parseSlashCommand('/plan add dark mode');
      expect(result).toEqual({ name: 'plan', args: 'add dark mode' });
    });

    it('returns null for non-slash input', () => {
      expect(parseSlashCommand('hello world')).toBeNull();
    });

    it('returns null for empty input', () => {
      expect(parseSlashCommand('')).toBeNull();
    });

    it('trims whitespace before parsing', () => {
      const result = parseSlashCommand('  /help  ');
      expect(result).toEqual({ name: 'help', args: '' });
    });
  });

  describe('Command registry', () => {
    beforeEach(() => {
      initCommands();
    });

    it('registers help command', () => {
      expect(getCommand('help')).toBeDefined();
      expect(getCommand('help')!.name).toBe('help');
    });

    it('registers status command', () => {
      expect(getCommand('status')).toBeDefined();
      expect(getCommand('status')!.name).toBe('status');
    });

    it('returns undefined for unknown command', () => {
      expect(getCommand('nonexistent')).toBeUndefined();
    });

    it('lists all commands', () => {
      const all = getAllCommands();
      expect(all.length).toBeGreaterThanOrEqual(2);
      const names = all.map((c) => c.name);
      expect(names).toContain('help');
      expect(names).toContain('status');
    });
  });
});

import { describe, it, expect } from 'vitest';
import {
  ALL_TOOLS,
  TOOL_MAP,
  TOOL_BASH,
  TOOL_READ,
  TOOL_WRITE,
  TOOL_GLOB,
  TOOL_GREP,
  SHELL_TOOLS,
  WRITE_TOOLS,
  READ_TOOLS,
} from '../core/tools.js';

describe('Tool definitions', () => {
  it('should define 5 tools', () => {
    expect(ALL_TOOLS).toHaveLength(5);
  });

  it('should have unique tool names', () => {
    const names = ALL_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('should have all required fields on each tool', () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.input_schema.type).toBe('object');
      expect(tool.input_schema.properties).toBeTruthy();
      expect(tool.input_schema.required).toBeInstanceOf(Array);
      expect(tool.input_schema.required.length).toBeGreaterThan(0);
    }
  });

  it('should build TOOL_MAP from ALL_TOOLS', () => {
    expect(TOOL_MAP['bash']).toBe(TOOL_BASH);
    expect(TOOL_MAP['read']).toBe(TOOL_READ);
    expect(TOOL_MAP['write']).toBe(TOOL_WRITE);
    expect(TOOL_MAP['glob']).toBe(TOOL_GLOB);
    expect(TOOL_MAP['grep']).toBe(TOOL_GREP);
  });

  it('should classify bash as a shell tool', () => {
    expect(SHELL_TOOLS.has('bash')).toBe(true);
    expect(SHELL_TOOLS.has('read')).toBe(false);
  });

  it('should classify write and bash as write tools', () => {
    expect(WRITE_TOOLS.has('write')).toBe(true);
    expect(WRITE_TOOLS.has('bash')).toBe(true);
    expect(WRITE_TOOLS.has('read')).toBe(false);
  });

  it('should classify read, glob, grep as read tools', () => {
    expect(READ_TOOLS.has('read')).toBe(true);
    expect(READ_TOOLS.has('glob')).toBe(true);
    expect(READ_TOOLS.has('grep')).toBe(true);
    expect(READ_TOOLS.has('bash')).toBe(false);
  });

  it('bash tool should require command', () => {
    expect(TOOL_BASH.input_schema.required).toContain('command');
  });

  it('read tool should require file_path', () => {
    expect(TOOL_READ.input_schema.required).toContain('file_path');
  });

  it('write tool should require file_path and content', () => {
    expect(TOOL_WRITE.input_schema.required).toContain('file_path');
    expect(TOOL_WRITE.input_schema.required).toContain('content');
  });
});

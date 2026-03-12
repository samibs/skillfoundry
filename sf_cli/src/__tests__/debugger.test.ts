import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// 1. CDPAdapter (debugger-cdp.ts)
// ---------------------------------------------------------------------------

describe('CDPAdapter', () => {
  it('can be instantiated', async () => {
    const { CDPAdapter } = await import('../core/debugger-cdp.js');
    const adapter = new CDPAdapter();
    expect(adapter).toBeDefined();
  });

  it('isConnected() returns false before connect', async () => {
    const { CDPAdapter } = await import('../core/debugger-cdp.js');
    const adapter = new CDPAdapter();
    expect(adapter.isConnected()).toBe(false);
  });

  it('isPaused() returns false initially', async () => {
    const { CDPAdapter } = await import('../core/debugger-cdp.js');
    const adapter = new CDPAdapter();
    expect(adapter.isPaused()).toBe(false);
  });

  it('getPauseLocation() returns null initially', async () => {
    const { CDPAdapter } = await import('../core/debugger-cdp.js');
    const adapter = new CDPAdapter();
    expect(adapter.getPauseLocation()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. DebugSession & detectRuntime (debugger.ts)
// ---------------------------------------------------------------------------

describe('detectRuntime', () => {
  const TEST_DIR = join(tmpdir(), 'sf-debugger-test-' + Date.now());

  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('returns "node" for directory with tsconfig.json', async () => {
    writeFileSync(join(TEST_DIR, 'tsconfig.json'), '{}');
    const { detectRuntime } = await import('../core/debugger.js');
    expect(detectRuntime(TEST_DIR)).toBe('node');
  });

  it('returns "node" for directory with package.json', async () => {
    writeFileSync(join(TEST_DIR, 'package.json'), '{}');
    const { detectRuntime } = await import('../core/debugger.js');
    expect(detectRuntime(TEST_DIR)).toBe('node');
  });

  it('returns "python" for directory with requirements.txt', async () => {
    writeFileSync(join(TEST_DIR, 'requirements.txt'), 'flask\n');
    const { detectRuntime } = await import('../core/debugger.js');
    expect(detectRuntime(TEST_DIR)).toBe('python');
  });

  it('returns "lldb" for directory with Cargo.toml', async () => {
    writeFileSync(join(TEST_DIR, 'Cargo.toml'), '[package]\nname = "test"\n');
    const { detectRuntime } = await import('../core/debugger.js');
    expect(detectRuntime(TEST_DIR)).toBe('lldb');
  });

  it('returns "node" as default when no known config file exists', async () => {
    const { detectRuntime } = await import('../core/debugger.js');
    expect(detectRuntime(TEST_DIR)).toBe('node');
  });
});

describe('DebugSession', () => {
  it('getActive() returns null when no session is active', async () => {
    const { DebugSession } = await import('../core/debugger.js');
    expect(DebugSession.getActive()).toBeNull();
  });

  it('start() throws for python runtime (not yet supported)', async () => {
    const { DebugSession } = await import('../core/debugger.js');
    await expect(
      DebugSession.start({
        file: 'test.py',
        runtime: 'python',
        workDir: '/tmp',
      }),
    ).rejects.toThrow(/Python debugging requires debugpy/);
  });

  it('start() throws for lldb runtime (not yet supported)', async () => {
    const { DebugSession } = await import('../core/debugger.js');
    await expect(
      DebugSession.start({
        file: 'main.rs',
        runtime: 'lldb',
        workDir: '/tmp',
      }),
    ).rejects.toThrow(/LLDB coming in Phase 3/);
  });
});

// ---------------------------------------------------------------------------
// 3. debugger-tools.ts
// ---------------------------------------------------------------------------

describe('debugger-tools', () => {
  it('DEBUG_TOOL_NAMES contains all 6 tool names', async () => {
    const { DEBUG_TOOL_NAMES } = await import('../core/debugger-tools.js');
    expect(DEBUG_TOOL_NAMES.size).toBe(6);
    expect(DEBUG_TOOL_NAMES.has('debug_start')).toBe(true);
    expect(DEBUG_TOOL_NAMES.has('debug_breakpoint')).toBe(true);
    expect(DEBUG_TOOL_NAMES.has('debug_inspect')).toBe(true);
    expect(DEBUG_TOOL_NAMES.has('debug_evaluate')).toBe(true);
    expect(DEBUG_TOOL_NAMES.has('debug_step')).toBe(true);
    expect(DEBUG_TOOL_NAMES.has('debug_stop')).toBe(true);
  });

  it('ALL_DEBUG_TOOLS has 6 definitions', async () => {
    const { ALL_DEBUG_TOOLS } = await import('../core/debugger-tools.js');
    expect(ALL_DEBUG_TOOLS).toHaveLength(6);
  });

  it('executeDebugTool returns error for unknown tool', async () => {
    const { executeDebugTool } = await import('../core/debugger-tools.js');
    const result = await executeDebugTool('debug_nonexistent', {}, '/tmp');
    expect(result.isError).toBe(true);
    expect(result.output).toContain('Unknown debug tool');
  });

  it('executeDebugTool("debug_stop", ...) returns error when no active session', async () => {
    const { executeDebugTool } = await import('../core/debugger-tools.js');
    const result = await executeDebugTool(
      'debug_stop',
      { session_id: 'fake-id' },
      '/tmp',
    );
    expect(result.isError).toBe(true);
    expect(result.output).toContain('No active debug session');
  });
});

// ---------------------------------------------------------------------------
// 4. Integration with executor.ts
// ---------------------------------------------------------------------------

describe('executeTool — debug tool integration', () => {
  const ALLOW_ALL_POLICY = {
    allow_shell: true,
    allow_network: false,
    allow_paths: ['.'],
    redact: false,
  };

  it('returns a Promise (thenable) for debug tool names', async () => {
    const { executeTool } = await import('../core/executor.js');
    const result = executeTool(
      'debug_stop',
      { session_id: 'test-id' },
      { workDir: '/tmp', policy: ALLOW_ALL_POLICY },
    );
    // Debug tools route through executeDebugTool which is async
    expect(result).toBeDefined();
    expect(typeof (result as Promise<unknown>).then).toBe('function');
  });

  it('returns a ToolResult (not a Promise) for regular tools like "read"', async () => {
    const { executeTool } = await import('../core/executor.js');
    const result = executeTool(
      'read',
      { file_path: '/nonexistent-file-for-test.txt' },
      { workDir: '/tmp', policy: ALLOW_ALL_POLICY },
    );
    // Regular tools return a synchronous ToolResult
    expect(result).toBeDefined();
    expect(typeof (result as any).then).toBe('undefined');
    expect(typeof (result as any).output).toBe('string');
    expect(typeof (result as any).isError).toBe('boolean');
  });
});

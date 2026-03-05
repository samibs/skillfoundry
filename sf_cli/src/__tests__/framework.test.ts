import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getFrameworkRoot,
  getAnvilScript,
  getFrameworkVersion,
  _resetFrameworkRootCache,
} from '../core/framework.js';

const FAKE_ROOT = join(tmpdir(), 'sf-framework-test-' + Date.now());

beforeEach(() => {
  _resetFrameworkRootCache();
  // Create a fake framework root structure
  mkdirSync(join(FAKE_ROOT, 'sf_cli'), { recursive: true });
  writeFileSync(join(FAKE_ROOT, '.version'), '2.0.0-test\n');
});

afterEach(() => {
  _resetFrameworkRootCache();
  delete process.env.SF_FRAMEWORK_ROOT;
  rmSync(FAKE_ROOT, { recursive: true, force: true });
});

describe('getFrameworkRoot', () => {
  it('returns SF_FRAMEWORK_ROOT when env var is set and valid', () => {
    process.env.SF_FRAMEWORK_ROOT = FAKE_ROOT;
    expect(getFrameworkRoot()).toBe(FAKE_ROOT);
  });

  it('warns when env var points to invalid dir', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.SF_FRAMEWORK_ROOT = '/nonexistent/path/that/does/not/exist';

    // Should fall through to file-based detection or throw
    try {
      getFrameworkRoot();
    } catch {
      // Expected — file-based fallback may also fail in test env
    }
    // Verify the warning was emitted
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('not a valid framework directory'),
    );
    spy.mockRestore();
  });

  it('caches the result after first call', () => {
    process.env.SF_FRAMEWORK_ROOT = FAKE_ROOT;
    const first = getFrameworkRoot();
    const second = getFrameworkRoot();
    expect(first).toBe(second);
  });

  it('resets cache with _resetFrameworkRootCache', () => {
    process.env.SF_FRAMEWORK_ROOT = FAKE_ROOT;
    getFrameworkRoot();
    _resetFrameworkRootCache();

    // Create a second fake root
    const newRoot = join(tmpdir(), 'sf-framework-test2-' + Date.now());
    mkdirSync(join(newRoot, 'sf_cli'), { recursive: true });
    writeFileSync(join(newRoot, '.version'), '3.0.0\n');
    process.env.SF_FRAMEWORK_ROOT = newRoot;

    expect(getFrameworkRoot()).toBe(newRoot);
    rmSync(newRoot, { recursive: true, force: true });
  });
});

describe('getAnvilScript', () => {
  it('returns null when no anvil script exists', () => {
    process.env.SF_FRAMEWORK_ROOT = FAKE_ROOT;
    expect(getAnvilScript()).toBeNull();
  });

  it('returns path when anvil script exists', () => {
    process.env.SF_FRAMEWORK_ROOT = FAKE_ROOT;
    mkdirSync(join(FAKE_ROOT, 'scripts'), { recursive: true });
    const ext = process.platform === 'win32' ? 'anvil.ps1' : 'anvil.sh';
    writeFileSync(join(FAKE_ROOT, 'scripts', ext), '#!/bin/bash\n');
    expect(getAnvilScript()).toBe(join(FAKE_ROOT, 'scripts', ext));
  });
});

describe('getFrameworkVersion', () => {
  it('reads version from .version file', () => {
    process.env.SF_FRAMEWORK_ROOT = FAKE_ROOT;
    expect(getFrameworkVersion()).toBe('2.0.0-test');
  });

  it('falls back to package.json', () => {
    process.env.SF_FRAMEWORK_ROOT = FAKE_ROOT;
    rmSync(join(FAKE_ROOT, '.version'));
    writeFileSync(
      join(FAKE_ROOT, 'sf_cli', 'package.json'),
      JSON.stringify({ version: '1.5.0' }),
    );
    _resetFrameworkRootCache();
    expect(getFrameworkVersion()).toBe('1.5.0');
  });

  it('returns 0.0.0 when no version sources exist', () => {
    process.env.SF_FRAMEWORK_ROOT = FAKE_ROOT;
    rmSync(join(FAKE_ROOT, '.version'));
    _resetFrameworkRootCache();
    expect(getFrameworkVersion()).toBe('0.0.0');
  });
});

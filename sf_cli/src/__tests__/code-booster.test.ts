import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  detectApplicableTransforms,
  transformVarToConst,
  transformAddTypes,
  transformWrapAsync,
  transformAddExport,
  transformRequireToImport,
  transformAddJsdoc,
  boostCode,
  boostFile,
  getTransformList,
  formatBoostReport,
  formatTransformList,
} from '../core/code-booster.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'booster-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('detectApplicableTransforms', () => {
  it('detects var declarations', () => {
    expect(detectApplicableTransforms('var x = 1;')).toContain('var-to-const');
  });

  it('detects untyped params', () => {
    expect(detectApplicableTransforms('function foo(a, b) {}')).toContain('add-types');
  });

  it('detects bare await', () => {
    expect(detectApplicableTransforms('await fetch(url);')).toContain('wrap-async');
  });

  it('detects unexported functions', () => {
    expect(detectApplicableTransforms('function foo() {}')).toContain('add-export');
  });

  it('detects require calls', () => {
    expect(detectApplicableTransforms("const fs = require('fs');")).toContain('require-to-import');
  });
});

describe('transformVarToConst', () => {
  it('converts unreassigned var to const', () => {
    const { code } = transformVarToConst('var x = 1;');
    expect(code).toContain('const x');
  });

  it('converts reassigned var to let', () => {
    const { code } = transformVarToConst('var x = 1;\nx = 2;');
    expect(code).toContain('let x');
  });

  it('handles multiple declarations', () => {
    const { code, result } = transformVarToConst('var a = 1;\nvar b = 2;');
    expect(result.changeCount).toBe(2);
    expect(code).toContain('const a');
    expect(code).toContain('const b');
  });

  it('ignores existing const/let', () => {
    const input = 'const x = 1;\nlet y = 2;';
    const { result } = transformVarToConst(input);
    expect(result.changeCount).toBe(0);
  });
});

describe('transformAddTypes', () => {
  it('adds : unknown to untyped params', () => {
    const { code } = transformAddTypes('function foo(a, b) {}');
    expect(code).toContain('a: unknown');
    expect(code).toContain('b: unknown');
  });

  it('skips already-typed params', () => {
    const input = 'function foo(a: string, b: number) {}';
    const { result } = transformAddTypes(input);
    expect(result.changeCount).toBe(0);
  });

  it('skips params with defaults', () => {
    const input = 'function foo(a = 5) {}';
    const { result } = transformAddTypes(input);
    expect(result.changeCount).toBe(0);
  });

  it('handles rest params', () => {
    const { code } = transformAddTypes('function foo(...args) {}');
    expect(code).toContain('...args: unknown[]');
  });
});

describe('transformWrapAsync', () => {
  it('wraps bare await', () => {
    const { code } = transformWrapAsync('const data = await fetch(url);');
    expect(code).toContain('try {');
    expect(code).toContain('catch');
  });

  it('skips await already in try', () => {
    const input = 'try {\n  const data = await fetch(url);\n} catch (e) {}';
    const { result } = transformWrapAsync(input);
    expect(result.changeCount).toBe(0);
  });

  it('handles multiple awaits', () => {
    const input = 'await a();\nawait b();';
    const { result } = transformWrapAsync(input);
    expect(result.changeCount).toBe(2);
  });

  it('preserves indentation', () => {
    const { code } = transformWrapAsync('    await fetch(url);');
    expect(code).toContain('    try {');
  });
});

describe('transformAddExport', () => {
  it('adds export to top-level function', () => {
    const { code } = transformAddExport('function foo() {}');
    expect(code).toContain('export function foo');
  });

  it('skips already exported', () => {
    const input = 'export function foo() {}';
    const { result } = transformAddExport(input);
    expect(result.changeCount).toBe(0);
  });

  it('adds export to class', () => {
    const { code } = transformAddExport('class Foo {}');
    expect(code).toContain('export class Foo');
  });
});

describe('transformRequireToImport', () => {
  it('converts basic require', () => {
    const { code } = transformRequireToImport("const fs = require('fs');");
    expect(code).toContain("import fs from 'fs'");
  });

  it('converts destructured require', () => {
    const { code } = transformRequireToImport("const { join, resolve } = require('path');");
    expect(code).toContain("import { join, resolve } from 'path'");
  });

  it('handles double quotes', () => {
    const { code } = transformRequireToImport('const fs = require("fs");');
    expect(code).toContain("import fs from 'fs'");
  });

  it('returns unchanged when no require', () => {
    const input = 'import fs from "fs";';
    const { result } = transformRequireToImport(input);
    expect(result.changeCount).toBe(0);
  });
});

describe('transformAddJsdoc', () => {
  it('adds JSDoc stub above function', () => {
    const { code } = transformAddJsdoc('function foo(a, b) {}');
    expect(code).toContain('/**');
    expect(code).toContain('@param a');
    expect(code).toContain('@param b');
    expect(code).toContain('@returns');
  });

  it('skips already documented', () => {
    const input = '/** Docs */\nfunction foo() {}';
    const { result } = transformAddJsdoc(input);
    expect(result.changeCount).toBe(0);
  });

  it('handles exported functions', () => {
    const { code } = transformAddJsdoc('export function bar(x) {}');
    expect(code).toContain('/**');
    expect(code).toContain('@param x');
  });
});

describe('boostCode', () => {
  it('applies all applicable transforms', () => {
    const input = "var x = 1;\nconst fs = require('fs');";
    const result = boostCode(input);
    expect(result.totalChanges).toBeGreaterThan(0);
    expect(result.transformedCode).not.toBe(input);
  });

  it('respects transforms filter', () => {
    const input = "var x = 1;\nconst fs = require('fs');";
    const result = boostCode(input, { transforms: ['var-to-const'] });
    expect(result.transforms.length).toBe(1);
    expect(result.transforms[0].id).toBe('var-to-const');
  });

  it('dry-run returns original code unchanged', () => {
    const input = 'var x = 1;';
    const result = boostCode(input, { dryRun: true });
    expect(result.transformedCode).toBe(input);
    expect(result.transforms[0].applied).toBe(true);
  });

  it('handles empty input', () => {
    const result = boostCode('');
    expect(result.totalChanges).toBe(0);
  });
});

describe('boostFile', () => {
  it('reads and transforms a file', () => {
    const path = join(tmpDir, 'test.ts');
    writeFileSync(path, 'var x = 1;\nvar y = 2;');
    const result = boostFile(path);
    expect(result.totalChanges).toBeGreaterThan(0);
  });
});

describe('getTransformList', () => {
  it('returns 6 transforms', () => {
    expect(getTransformList()).toHaveLength(6);
  });
});

describe('formatBoostReport', () => {
  it('includes change count', () => {
    const result = boostCode('var x = 1;');
    const report = formatBoostReport(result);
    expect(report).toContain('Total changes');
  });

  it('shows tokens saved', () => {
    const result = boostCode('var x = 1;');
    const report = formatBoostReport(result);
    expect(report).toContain('Tokens saved');
  });

  it('handles zero changes', () => {
    const result = boostCode('const x: number = 1;');
    const report = formatBoostReport(result);
    expect(report).toContain('Total changes: 0');
  });
});

describe('formatTransformList', () => {
  it('lists all transforms', () => {
    const list = formatTransformList();
    expect(list).toContain('var-to-const');
    expect(list).toContain('require-to-import');
  });
});

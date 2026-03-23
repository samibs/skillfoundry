/**
 * Code Transform Booster — Fast mechanical code transforms without LLM calls.
 *
 * Handles: var→const, add types, wrap async, add export, require→import,
 * add JSDoc stubs, callback→async. Near-instant, zero token cost.
 */

import { readFileSync } from 'node:fs';

// ── Types ───────────────────────────────────────────────────────

export type TransformId =
  | 'var-to-const'
  | 'add-types'
  | 'wrap-async'
  | 'add-export'
  | 'require-to-import'
  | 'add-jsdoc';

export interface TransformResult {
  id: TransformId;
  name: string;
  applied: boolean;
  changeCount: number;
  description: string;
}

export interface BoostResult {
  originalCode: string;
  transformedCode: string;
  transforms: TransformResult[];
  totalChanges: number;
  tokensSaved: number;
}

// ── Constants ───────────────────────────────────────────────────

const LINE = '\u2501';
const TOKENS_PER_LLM_CALL = 2000; // approximate tokens an LLM would use per transform

// ── Transform Implementations ───────────────────────────────────

/**
 * Convert `var` to `const` or `let` based on reassignment.
 */
export function transformVarToConst(code: string): { code: string; result: TransformResult } {
  let count = 0;
  const transformed = code.replace(/\bvar\s+(\w+)/g, (match, name) => {
    // Check if reassigned later (name = or name++ or name--)
    const reassignPattern = new RegExp(`\\b${name}\\s*[+\\-*/]?=(?!=)|\\b${name}\\+\\+|\\b${name}--`, 'g');
    // Count assignments beyond the declaration
    const assignments = (code.match(reassignPattern) || []).length;
    count++;
    if (assignments > 1) {
      return `let ${name}`;
    }
    return `const ${name}`;
  });

  return {
    code: transformed,
    result: {
      id: 'var-to-const',
      name: 'var → const/let',
      applied: count > 0,
      changeCount: count,
      description: count > 0 ? `Converted ${count} var declarations` : 'No var declarations found',
    },
  };
}

/**
 * Add `: unknown` type annotation to untyped function parameters.
 */
export function transformAddTypes(code: string): { code: string; result: TransformResult } {
  let count = 0;

  // Match function declarations with untyped params
  const transformed = code.replace(
    /function\s+\w+\s*\(([^)]*)\)/g,
    (match, params: string) => {
      if (!params.trim()) return match;
      const typedParams = params.split(',').map((p: string) => {
        const trimmed = p.trim();
        if (!trimmed) return p;
        if (trimmed.includes(':')) return p; // already typed
        if (trimmed.startsWith('...')) {
          count++;
          return p.replace(trimmed, `${trimmed}: unknown[]`);
        }
        // Check for default value
        if (trimmed.includes('=')) {
          return p; // has default, type can be inferred
        }
        count++;
        return p.replace(trimmed, `${trimmed}: unknown`);
      });
      return match.replace(params, typedParams.join(','));
    },
  );

  return {
    code: transformed,
    result: {
      id: 'add-types',
      name: 'Add type annotations',
      applied: count > 0,
      changeCount: count,
      description: count > 0 ? `Added ': unknown' to ${count} parameters` : 'No untyped parameters found',
    },
  };
}

/**
 * Wrap bare `await` calls that aren't in a try block.
 */
export function transformWrapAsync(code: string): { code: string; result: TransformResult } {
  const lines = code.split('\n');
  let count = 0;
  const result: string[] = [];
  let inTry = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/\btry\s*\{/.test(line)) inTry++;
    if (/\}\s*catch/.test(line)) inTry = Math.max(0, inTry - 1);

    if (inTry === 0 && /\bawait\b/.test(line) && !line.trim().startsWith('//')) {
      const indent = line.match(/^(\s*)/)?.[1] || '';
      result.push(`${indent}try {`);
      result.push(`${indent}  ${line.trim()}`);
      result.push(`${indent}} catch (error: unknown) {`);
      result.push(`${indent}  throw error;`);
      result.push(`${indent}}`);
      count++;
    } else {
      result.push(line);
    }
  }

  return {
    code: result.join('\n'),
    result: {
      id: 'wrap-async',
      name: 'Wrap bare await',
      applied: count > 0,
      changeCount: count,
      description: count > 0 ? `Wrapped ${count} bare await expressions` : 'No bare await found',
    },
  };
}

/**
 * Add `export` to top-level function/class declarations.
 */
export function transformAddExport(code: string): { code: string; result: TransformResult } {
  let count = 0;

  const transformed = code.replace(
    /^(function\s+\w+|class\s+\w+)/gm,
    (match) => {
      count++;
      return `export ${match}`;
    },
  );

  // Don't double-export
  const cleaned = transformed.replace(/export\s+export\s+/g, 'export ');
  const actualCount = (cleaned.match(/^export\s+(function|class)/gm) || []).length -
    (code.match(/^export\s+(function|class)/gm) || []).length;

  return {
    code: cleaned,
    result: {
      id: 'add-export',
      name: 'Add export',
      applied: actualCount > 0,
      changeCount: Math.max(0, actualCount),
      description: actualCount > 0 ? `Added export to ${actualCount} declarations` : 'No unexported declarations found',
    },
  };
}

/**
 * Convert `require()` to `import` syntax.
 */
export function transformRequireToImport(code: string): { code: string; result: TransformResult } {
  let count = 0;

  let transformed = code;

  // const X = require('Y') → import X from 'Y'
  transformed = transformed.replace(
    /const\s+(\w+)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    (_match, name, mod) => {
      count++;
      return `import ${name} from '${mod}'`;
    },
  );

  // const { A, B } = require('Y') → import { A, B } from 'Y'
  transformed = transformed.replace(
    /const\s*\{([^}]+)\}\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    (_match, names, mod) => {
      count++;
      return `import {${names}} from '${mod}'`;
    },
  );

  return {
    code: transformed,
    result: {
      id: 'require-to-import',
      name: 'require → import',
      applied: count > 0,
      changeCount: count,
      description: count > 0 ? `Converted ${count} require() calls to import` : 'No require() calls found',
    },
  };
}

/**
 * Add JSDoc stubs to undocumented functions.
 */
export function transformAddJsdoc(code: string): { code: string; result: TransformResult } {
  const lines = code.split('\n');
  const result: string[] = [];
  let count = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const funcMatch = line.match(/^(\s*)(export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/);

    if (funcMatch) {
      // Check if previous non-empty line is already JSDoc
      let prevIdx = i - 1;
      while (prevIdx >= 0 && !lines[prevIdx].trim()) prevIdx--;
      if (prevIdx >= 0 && lines[prevIdx].trim().endsWith('*/')) {
        result.push(line);
        continue;
      }

      const indent = funcMatch[1];
      const name = funcMatch[3];
      const params = funcMatch[4];

      const jsdoc = [`${indent}/**`, `${indent} * ${name}`];
      if (params.trim()) {
        for (const p of params.split(',')) {
          const paramName = p.trim().split(/[:\s=]/)[0].replace('...', '');
          if (paramName) jsdoc.push(`${indent} * @param ${paramName}`);
        }
      }
      jsdoc.push(`${indent} * @returns`);
      jsdoc.push(`${indent} */`);

      result.push(...jsdoc);
      count++;
    }
    result.push(line);
  }

  return {
    code: result.join('\n'),
    result: {
      id: 'add-jsdoc',
      name: 'Add JSDoc stubs',
      applied: count > 0,
      changeCount: count,
      description: count > 0 ? `Added JSDoc stubs to ${count} functions` : 'No undocumented functions found',
    },
  };
}

// ── Transform Registry ──────────────────────────────────────────

const TRANSFORM_MAP: Record<TransformId, (code: string) => { code: string; result: TransformResult }> = {
  'var-to-const': transformVarToConst,
  'add-types': transformAddTypes,
  'wrap-async': transformWrapAsync,
  'add-export': transformAddExport,
  'require-to-import': transformRequireToImport,
  'add-jsdoc': transformAddJsdoc,
};

export function getTransformList(): Array<{ id: TransformId; name: string; description: string }> {
  return [
    { id: 'var-to-const', name: 'var → const/let', description: 'Convert var to const or let based on reassignment' },
    { id: 'add-types', name: 'Add type annotations', description: 'Add : unknown to untyped function parameters' },
    { id: 'wrap-async', name: 'Wrap bare await', description: 'Wrap unguarded await in try/catch' },
    { id: 'add-export', name: 'Add export', description: 'Export top-level functions and classes' },
    { id: 'require-to-import', name: 'require → import', description: 'Convert require() to ES import syntax' },
    { id: 'add-jsdoc', name: 'Add JSDoc stubs', description: 'Add documentation stubs to undocumented functions' },
  ];
}

// ── Detection ───────────────────────────────────────────────────

/**
 * Detect which transforms are applicable to the given code.
 */
export function detectApplicableTransforms(code: string): TransformId[] {
  const applicable: TransformId[] = [];

  if (/\bvar\s+\w+/.test(code)) applicable.push('var-to-const');
  if (/function\s+\w+\s*\([^)]*[^:)]+\)/.test(code)) {
    // Check if any param lacks a type annotation
    const funcParams = code.match(/function\s+\w+\s*\(([^)]+)\)/g) || [];
    for (const fp of funcParams) {
      const params = fp.match(/\(([^)]+)\)/)?.[1] || '';
      if (params.split(',').some((p) => !p.includes(':') && !p.includes('=') && p.trim())) {
        applicable.push('add-types');
        break;
      }
    }
  }
  if (/\bawait\b/.test(code)) applicable.push('wrap-async');
  if (/^(?:async\s+)?function\s+\w+/m.test(code) && !/^export\s/m.test(code)) applicable.push('add-export');
  if (/\brequire\s*\(/.test(code)) applicable.push('require-to-import');
  if (/^(?:export\s+)?(?:async\s+)?function\s+\w+/m.test(code)) {
    // Check if any function lacks JSDoc
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*(?:export\s+)?(?:async\s+)?function\s+\w+/.test(lines[i])) {
        let prev = i - 1;
        while (prev >= 0 && !lines[prev].trim()) prev--;
        if (prev < 0 || !lines[prev].trim().endsWith('*/')) {
          applicable.push('add-jsdoc');
          break;
        }
      }
    }
  }

  return applicable;
}

// ── Main Functions ──────────────────────────────────────────────

/**
 * Apply transforms to a code string.
 */
export function boostCode(
  code: string,
  options?: { transforms?: TransformId[]; dryRun?: boolean },
): BoostResult {
  const transformIds = options?.transforms || detectApplicableTransforms(code);
  const transforms: TransformResult[] = [];
  let current = code;

  for (const id of transformIds) {
    const fn = TRANSFORM_MAP[id];
    if (!fn) continue;

    if (options?.dryRun) {
      const { result } = fn(current);
      transforms.push(result);
    } else {
      const { code: transformed, result } = fn(current);
      current = transformed;
      transforms.push(result);
    }
  }

  const totalChanges = transforms.reduce((sum, t) => sum + t.changeCount, 0);

  return {
    originalCode: code,
    transformedCode: options?.dryRun ? code : current,
    transforms,
    totalChanges,
    tokensSaved: totalChanges > 0 ? totalChanges * TOKENS_PER_LLM_CALL : 0,
  };
}

/**
 * Apply transforms to a file.
 */
export function boostFile(
  filePath: string,
  options?: { transforms?: TransformId[]; dryRun?: boolean },
): BoostResult {
  const code = readFileSync(filePath, 'utf-8');
  return boostCode(code, options);
}

// ── Formatting ──────────────────────────────────────────────────

export function formatBoostReport(result: BoostResult): string {
  const lines = [
    'Code Booster',
    LINE.repeat(60),
    `  Total changes: ${result.totalChanges}`,
    `  Tokens saved:  ~${result.tokensSaved.toLocaleString()} (vs LLM transform)`,
    '',
    '  Transforms:',
  ];

  for (const t of result.transforms) {
    const icon = t.applied ? '\u2713' : '\u2500';
    lines.push(`    ${icon} ${t.name.padEnd(22)} ${t.description}`);
  }

  lines.push('');
  return lines.join('\n');
}

export function formatTransformList(): string {
  const transforms = getTransformList();
  const lines = [
    'Available Code Transforms',
    LINE.repeat(60),
    '',
  ];
  for (const t of transforms) {
    lines.push(`  ${t.id.padEnd(22)} ${t.description}`);
  }
  lines.push('');
  return lines.join('\n');
}

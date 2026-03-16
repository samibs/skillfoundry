#!/usr/bin/env node

// sf-runner.mjs — Thin ESM wrapper that loads sf_cli core modules and runs
// operations requested by the VS Code extension (or any CJS caller).
//
// Usage:
//   node sf-runner.mjs --gate-all --workdir /path/to/project
//   node sf-runner.mjs --gate T1 --workdir /path/to/project [--target src/foo.ts]
//   node sf-runner.mjs --scan-deps --workdir /path/to/project
//   node sf-runner.mjs --report --workdir /path/to/project [--window 10]
//   node sf-runner.mjs --metrics --workdir /path/to/project [--window 10]
//
// Output: JSON to stdout. Errors go to stderr.

import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// sf_cli/bin/sf-runner.mjs → sf_cli/dist/core/
const CORE_DIR = join(__dirname, '..', 'dist', 'core');

// Parse args
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  if (idx === -1) return null;
  return args[idx + 1] || null;
}
function hasFlag(name) {
  return args.includes(name);
}

const workDir = resolve(getArg('--workdir') || process.cwd());

// Set SF_FRAMEWORK_ROOT so getFrameworkRoot() finds scripts/anvil.sh
// The framework root is two levels up from sf_cli/bin/
const frameworkRoot = resolve(__dirname, '..', '..');
process.env.SF_FRAMEWORK_ROOT = frameworkRoot;

// Suppress non-JSON output (logger, console.error from modules)
const originalStderr = process.stderr.write.bind(process.stderr);
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const stderrBuffer = [];
console.error = (...a) => stderrBuffer.push(a.join(' '));
console.warn = (...a) => stderrBuffer.push(a.join(' '));

function output(obj) {
  // Restore stderr before outputting
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function fail(msg) {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  process.stderr.write(stderrBuffer.join('\n') + '\n');
  process.stderr.write(`sf-runner error: ${msg}\n`);
  process.exit(1);
}

try {
  if (hasFlag('--gate-all')) {
    const { runAllGates } = await import(join(CORE_DIR, 'gates.js'));
    const target = getArg('--target') || '.';
    const storyFile = getArg('--story') || undefined;
    const summary = await runAllGates({
      workDir,
      target,
      storyFile,
    });
    output(summary);
  }
  else if (hasFlag('--gate')) {
    const tier = getArg('--gate');
    if (!tier) fail('--gate requires a tier (e.g., --gate T1)');
    const { runSingleGate } = await import(join(CORE_DIR, 'gates.js'));
    const target = getArg('--target') || '.';
    const storyFile = getArg('--story') || undefined;
    const result = runSingleGate(tier, workDir, target, storyFile);
    output(result);
  }
  else if (hasFlag('--scan-deps')) {
    const { runDependencyScan } = await import(join(CORE_DIR, 'dependency-scanner.js'));
    const report = runDependencyScan(workDir);
    output(report);
  }
  else if (hasFlag('--report')) {
    const { generateReport, formatReportMarkdown } = await import(join(CORE_DIR, 'report-generator.js'));
    const window = parseInt(getArg('--window') || '10', 10);
    const report = generateReport(workDir, window);
    const markdown = formatReportMarkdown(report);
    output({ report, markdown });
  }
  else if (hasFlag('--metrics')) {
    const { aggregateMetrics, formatMetricsWithBaselines } = await import(join(CORE_DIR, 'telemetry.js'));
    const window = parseInt(getArg('--window') || '10', 10);
    const agg = aggregateMetrics(workDir, window);
    const formatted = formatMetricsWithBaselines(agg);
    output({ aggregation: agg, formatted });
  }
  else {
    fail('No command specified. Use --gate-all, --gate T1, --scan-deps, --report, or --metrics');
  }
} catch (err) {
  fail(err.message || String(err));
}

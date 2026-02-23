// Quality gates — wraps scripts/anvil.sh and project-level checks.
// T1: Banned patterns + syntax (anvil.sh)
// T2: Type checking (tsc / pyright / etc.)
// T3: Tests (vitest / pytest / dotnet test / etc.)
// T4: Security scan (anvil.sh patterns + optional OWASP checks)
// T5: Build verification (npm run build / cargo build / etc.)
// T6: Scope validation (anvil.sh scope)

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export type GateStatus = 'pass' | 'fail' | 'warn' | 'skip' | 'running';

export interface GateResult {
  tier: string;
  name: string;
  status: GateStatus;
  detail: string;
  durationMs: number;
}

export interface GateRunSummary {
  gates: GateResult[];
  passed: number;
  failed: number;
  warned: number;
  skipped: number;
  totalMs: number;
  verdict: 'PASS' | 'WARN' | 'FAIL';
}

function runCommand(cmd: string, cwd: string, timeoutMs: number = 60_000): { ok: boolean; output: string } {
  try {
    const output = execSync(cmd, {
      cwd,
      timeout: timeoutMs,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 5 * 1024 * 1024,
    });
    return { ok: true, output: output || '' };
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string; message?: string; status?: number };
    const combined = (execErr.stdout || '') + (execErr.stderr || '');
    return { ok: false, output: combined || execErr.message || 'Command failed' };
  }
}

function findAnvilScript(workDir: string): string | null {
  const candidates = [
    join(workDir, 'scripts', 'anvil.sh'),
    join(workDir, 'scripts', 'anvil'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return null;
}

function detectProjectType(workDir: string): {
  hasTypeScript: boolean;
  hasPackageJson: boolean;
  hasPython: boolean;
  hasCargo: boolean;
  hasDotnet: boolean;
} {
  return {
    hasTypeScript: existsSync(join(workDir, 'tsconfig.json')),
    hasPackageJson: existsSync(join(workDir, 'package.json')),
    hasPython: existsSync(join(workDir, 'requirements.txt')) || existsSync(join(workDir, 'pyproject.toml')),
    hasCargo: existsSync(join(workDir, 'Cargo.toml')),
    hasDotnet: existsSync(join(workDir, '*.csproj')) || existsSync(join(workDir, '*.sln')),
  };
}

// T1: Banned patterns + syntax (via anvil.sh or inline)
function runT1(workDir: string, target: string): GateResult {
  const start = Date.now();
  const anvil = findAnvilScript(workDir);

  if (anvil) {
    const { ok, output } = runCommand(`bash "${anvil}" check "${target}"`, workDir);
    return {
      tier: 'T1',
      name: 'Banned Patterns & Syntax',
      status: ok ? 'pass' : 'fail',
      detail: output.slice(0, 500),
      durationMs: Date.now() - start,
    };
  }

  // Inline fallback: grep for banned patterns
  const banned = ['TODO', 'FIXME', 'HACK', 'PLACEHOLDER', 'STUB', 'NOT IMPLEMENTED'];
  const { ok, output } = runCommand(
    `grep -rn "${banned.join('\\|')}" "${target}" --include="*.ts" --include="*.js" --include="*.py" --exclude-dir=node_modules --exclude-dir=dist 2>/dev/null || true`,
    workDir,
  );

  const hasBanned = output.trim().length > 0;
  return {
    tier: 'T1',
    name: 'Banned Patterns & Syntax',
    status: hasBanned ? 'fail' : 'pass',
    detail: hasBanned ? `Banned patterns found:\n${output.slice(0, 400)}` : 'No banned patterns detected',
    durationMs: Date.now() - start,
  };
}

// T2: Type checking
function runT2(workDir: string): GateResult {
  const start = Date.now();
  const project = detectProjectType(workDir);

  if (project.hasTypeScript) {
    const { ok, output } = runCommand('npx tsc --noEmit 2>&1', workDir, 120_000);
    return {
      tier: 'T2',
      name: 'Type Check',
      status: ok ? 'pass' : 'fail',
      detail: ok ? 'TypeScript compilation clean' : output.slice(0, 500),
      durationMs: Date.now() - start,
    };
  }

  if (project.hasPython) {
    const { ok } = runCommand('which pyright', workDir);
    if (ok) {
      const result = runCommand('pyright 2>&1', workDir, 120_000);
      return {
        tier: 'T2',
        name: 'Type Check',
        status: result.ok ? 'pass' : 'fail',
        detail: result.ok ? 'Pyright check clean' : result.output.slice(0, 500),
        durationMs: Date.now() - start,
      };
    }
  }

  return {
    tier: 'T2',
    name: 'Type Check',
    status: 'skip',
    detail: 'No type checker detected for this project',
    durationMs: Date.now() - start,
  };
}

// T3: Tests
function runT3(workDir: string): GateResult {
  const start = Date.now();
  const project = detectProjectType(workDir);

  if (project.hasPackageJson) {
    // Check for test script in package.json
    try {
      const pkg = JSON.parse(
        execSync('cat package.json', { cwd: workDir, encoding: 'utf-8' }),
      );
      if (pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
        const { ok, output } = runCommand('npm test 2>&1', workDir, 300_000);
        return {
          tier: 'T3',
          name: 'Tests',
          status: ok ? 'pass' : 'fail',
          detail: ok ? 'All tests passed' : output.slice(-500),
          durationMs: Date.now() - start,
        };
      }
    } catch {
      // Fall through
    }

    // Try vitest directly
    const { ok: hasVitest } = runCommand('npx vitest --version 2>/dev/null', workDir);
    if (hasVitest) {
      const { ok, output } = runCommand('npx vitest run 2>&1', workDir, 300_000);
      return {
        tier: 'T3',
        name: 'Tests',
        status: ok ? 'pass' : 'fail',
        detail: ok ? 'All tests passed' : output.slice(-500),
        durationMs: Date.now() - start,
      };
    }
  }

  if (project.hasPython) {
    const { ok, output } = runCommand('python3 -m pytest 2>&1', workDir, 300_000);
    return {
      tier: 'T3',
      name: 'Tests',
      status: ok ? 'pass' : 'fail',
      detail: ok ? 'All tests passed' : output.slice(-500),
      durationMs: Date.now() - start,
    };
  }

  return {
    tier: 'T3',
    name: 'Tests',
    status: 'skip',
    detail: 'No test runner detected',
    durationMs: Date.now() - start,
  };
}

// T4: Security scan
function runT4(workDir: string, target: string): GateResult {
  const start = Date.now();
  const anvil = findAnvilScript(workDir);

  if (anvil) {
    const { ok, output } = runCommand(`bash "${anvil}" patterns "${target}"`, workDir);
    return {
      tier: 'T4',
      name: 'Security Scan',
      status: ok ? 'pass' : 'fail',
      detail: output.slice(0, 500),
      durationMs: Date.now() - start,
    };
  }

  // Inline security checks: hardcoded secrets, common vulnerabilities
  const securityPatterns = [
    'password\\s*=\\s*["\'][^"\']*["\']',
    'api[_-]?key\\s*=\\s*["\']',
    'secret\\s*=\\s*["\']',
    'BEGIN (RSA |DSA |EC )?PRIVATE KEY',
  ];
  const pattern = securityPatterns.join('\\|');
  const { output } = runCommand(
    `grep -rni "${pattern}" "${target}" --include="*.ts" --include="*.js" --include="*.py" --include="*.json" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git 2>/dev/null || true`,
    workDir,
  );

  const hasIssues = output.trim().length > 0;
  return {
    tier: 'T4',
    name: 'Security Scan',
    status: hasIssues ? 'warn' : 'pass',
    detail: hasIssues ? `Potential security issues:\n${output.slice(0, 400)}` : 'No security issues detected',
    durationMs: Date.now() - start,
  };
}

// T5: Build verification
function runT5(workDir: string): GateResult {
  const start = Date.now();
  const project = detectProjectType(workDir);

  if (project.hasPackageJson) {
    try {
      const pkg = JSON.parse(
        execSync('cat package.json', { cwd: workDir, encoding: 'utf-8' }),
      );
      if (pkg.scripts?.build) {
        const { ok, output } = runCommand('npm run build 2>&1', workDir, 120_000);
        return {
          tier: 'T5',
          name: 'Build',
          status: ok ? 'pass' : 'fail',
          detail: ok ? 'Build succeeded' : output.slice(-500),
          durationMs: Date.now() - start,
        };
      }
    } catch {
      // Fall through
    }
  }

  if (project.hasCargo) {
    const { ok, output } = runCommand('cargo build 2>&1', workDir, 300_000);
    return {
      tier: 'T5',
      name: 'Build',
      status: ok ? 'pass' : 'fail',
      detail: ok ? 'Build succeeded' : output.slice(-500),
      durationMs: Date.now() - start,
    };
  }

  return {
    tier: 'T5',
    name: 'Build',
    status: 'skip',
    detail: 'No build command detected',
    durationMs: Date.now() - start,
  };
}

// T6: Scope validation
function runT6(workDir: string, storyFile?: string): GateResult {
  const start = Date.now();

  if (!storyFile) {
    return {
      tier: 'T6',
      name: 'Scope Validation',
      status: 'skip',
      detail: 'No story file provided for scope check',
      durationMs: Date.now() - start,
    };
  }

  const anvil = findAnvilScript(workDir);
  if (anvil) {
    const { ok, output } = runCommand(`bash "${anvil}" scope "${storyFile}"`, workDir);
    return {
      tier: 'T6',
      name: 'Scope Validation',
      status: ok ? 'pass' : (output.includes('[WARN]') ? 'warn' : 'fail'),
      detail: output.slice(0, 500),
      durationMs: Date.now() - start,
    };
  }

  return {
    tier: 'T6',
    name: 'Scope Validation',
    status: 'skip',
    detail: 'Anvil script not found for scope validation',
    durationMs: Date.now() - start,
  };
}

export interface GateOptions {
  workDir: string;
  target?: string;
  storyFile?: string;
  onGateStart?: (tier: string, name: string) => void;
  onGateComplete?: (result: GateResult) => void;
}

export async function runAllGates(options: GateOptions): Promise<GateRunSummary> {
  const { workDir, target = '.', storyFile, onGateStart, onGateComplete } = options;
  const resolvedTarget = resolve(workDir, target);
  const gates: GateResult[] = [];

  const tiers = [
    { run: () => runT1(workDir, resolvedTarget), tier: 'T1', name: 'Banned Patterns & Syntax' },
    { run: () => runT2(workDir), tier: 'T2', name: 'Type Check' },
    { run: () => runT3(workDir), tier: 'T3', name: 'Tests' },
    { run: () => runT4(workDir, resolvedTarget), tier: 'T4', name: 'Security Scan' },
    { run: () => runT5(workDir), tier: 'T5', name: 'Build' },
    { run: () => runT6(workDir, storyFile), tier: 'T6', name: 'Scope Validation' },
  ];

  for (const { run, tier, name } of tiers) {
    onGateStart?.(tier, name);
    const result = run();
    gates.push(result);
    onGateComplete?.(result);
  }

  const passed = gates.filter((g) => g.status === 'pass').length;
  const failed = gates.filter((g) => g.status === 'fail').length;
  const warned = gates.filter((g) => g.status === 'warn').length;
  const skipped = gates.filter((g) => g.status === 'skip').length;
  const totalMs = gates.reduce((sum, g) => sum + g.durationMs, 0);

  let verdict: 'PASS' | 'WARN' | 'FAIL' = 'PASS';
  if (failed > 0) verdict = 'FAIL';
  else if (warned > 0) verdict = 'WARN';

  return { gates, passed, failed, warned, skipped, totalMs, verdict };
}

export function runSingleGate(
  tier: string,
  workDir: string,
  target: string = '.',
  storyFile?: string,
): GateResult {
  const resolvedTarget = resolve(workDir, target);
  switch (tier.toUpperCase()) {
    case 'T1': return runT1(workDir, resolvedTarget);
    case 'T2': return runT2(workDir);
    case 'T3': return runT3(workDir);
    case 'T4': return runT4(workDir, resolvedTarget);
    case 'T5': return runT5(workDir);
    case 'T6': return runT6(workDir, storyFile);
    default:
      return {
        tier,
        name: 'Unknown',
        status: 'skip',
        detail: `Unknown gate tier: ${tier}`,
        durationMs: 0,
      };
  }
}

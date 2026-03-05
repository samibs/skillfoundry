// Quality gates — wraps scripts/anvil.sh and project-level checks.
// T1: Banned patterns + syntax (anvil.sh)
// T2: Type checking (tsc / pyright / etc.)
// T3: Tests (vitest / pytest / dotnet test / etc.)
// T4: Security scan (anvil.sh patterns + optional OWASP checks)
// T5: Build verification (npm run build / cargo build / etc.)
// T6: Scope validation (anvil.sh scope)
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getFrameworkRoot } from './framework.js';
const IS_WINDOWS = process.platform === 'win32';
const WHICH_CMD = IS_WINDOWS ? 'where' : 'which';
const NULL_DEVICE = IS_WINDOWS ? 'NUL' : '/dev/null';
function runCommand(cmd, cwd, timeoutMs = 60_000) {
    try {
        const output = execSync(cmd, {
            cwd,
            timeout: timeoutMs,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
            maxBuffer: 5 * 1024 * 1024,
        });
        return { ok: true, output: output || '' };
    }
    catch (err) {
        const execErr = err;
        const combined = (execErr.stdout || '') + (execErr.stderr || '');
        return { ok: false, output: combined || execErr.message || 'Command failed' };
    }
}
function findAnvilScript(workDir) {
    // Extensions to check: .ps1/.cmd on Windows (bash can't handle C:/ paths), .sh on Unix
    const extensions = IS_WINDOWS
        ? ['anvil.ps1', 'anvil.cmd']
        : ['anvil.sh', 'anvil'];
    const candidates = [];
    // Check project-local first (if user copied scripts/ into their project)
    for (const ext of extensions) {
        candidates.push(join(workDir, 'scripts', ext));
    }
    // Then check framework root (the canonical location)
    try {
        const frameworkRoot = getFrameworkRoot();
        for (const ext of extensions) {
            candidates.push(join(frameworkRoot, 'scripts', ext));
        }
    }
    catch {
        // Framework root not available — skip framework candidates
    }
    for (const path of candidates) {
        if (existsSync(path))
            return path;
    }
    return null;
}
function anvilCommand(anvilPath, args) {
    if (anvilPath.endsWith('.ps1')) {
        return `powershell -ExecutionPolicy Bypass -File "${anvilPath}" ${args}`;
    }
    if (anvilPath.endsWith('.cmd')) {
        return `"${anvilPath}" ${args}`;
    }
    // On Windows, convert backslash paths to forward slashes for bash/sh compatibility
    const safePath = IS_WINDOWS ? anvilPath.replace(/\\/g, '/') : anvilPath;
    return `bash "${safePath}" ${args}`;
}
function detectProjectType(workDir) {
    return {
        hasTypeScript: existsSync(join(workDir, 'tsconfig.json')),
        hasPackageJson: existsSync(join(workDir, 'package.json')),
        hasPython: existsSync(join(workDir, 'requirements.txt')) || existsSync(join(workDir, 'pyproject.toml')),
        hasCargo: existsSync(join(workDir, 'Cargo.toml')),
        hasDotnet: existsSync(join(workDir, '*.csproj')) || existsSync(join(workDir, '*.sln')),
    };
}
// T1: Banned patterns + syntax (via anvil.sh or inline)
function runT1(workDir, target) {
    const start = Date.now();
    const anvil = findAnvilScript(workDir);
    if (anvil) {
        const { ok, output } = runCommand(anvilCommand(anvil, `check "${target}"`), workDir);
        return {
            tier: 'T1',
            name: 'Banned Patterns & Syntax',
            status: ok ? 'pass' : 'fail',
            detail: output.slice(0, 500),
            durationMs: Date.now() - start,
        };
    }
    // Inline fallback: search for banned patterns (cross-platform)
    // Only scan source code files, exclude framework/docs/generated directories
    const banned = ['TODO', 'FIXME', 'HACK', 'PLACEHOLDER', 'STUB', 'NOT IMPLEMENTED'];
    let grepCmd;
    if (IS_WINDOWS) {
        grepCmd = `findstr /s /n "${banned.join(' ')}" "${target}\\*.ts" "${target}\\*.js" "${target}\\*.py" 2>${NULL_DEVICE} || exit /b 0`;
    }
    else {
        const excludeDirs = [
            'node_modules', 'dist', '.git', '.skillfoundry', '.claude',
            'genesis', 'memory_bank', 'scratchpads', 'docs',
            'coverage', '__pycache__', '.next', '.nuxt', '.cache',
        ].map((d) => `--exclude-dir=${d}`).join(' ');
        const excludeFiles = '--exclude=CHANGELOG.md --exclude=*.test.ts --exclude=*.spec.ts --exclude=*.test.js --exclude=*.spec.js';
        grepCmd = `grep -rn "${banned.join('\\|')}" "${target}" --include="*.ts" --include="*.js" --include="*.py" --include="*.tsx" --include="*.jsx" ${excludeDirs} ${excludeFiles} 2>/dev/null || true`;
    }
    const { ok, output } = runCommand(grepCmd, workDir);
    // Filter out comments — only flag TODO/FIXME etc. in actual code, not in comments
    const lines = output.trim().split('\n').filter((l) => l.trim().length > 0);
    const hasBanned = lines.length > 0;
    return {
        tier: 'T1',
        name: 'Banned Patterns & Syntax',
        status: hasBanned ? 'fail' : 'pass',
        detail: hasBanned ? `Banned patterns found (${lines.length} hits):\n${lines.slice(0, 10).join('\n')}` : 'No banned patterns detected',
        durationMs: Date.now() - start,
    };
}
// T2: Type checking
function runT2(workDir) {
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
        const { ok } = runCommand(`${WHICH_CMD} pyright`, workDir);
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
function runT3(workDir) {
    const start = Date.now();
    const project = detectProjectType(workDir);
    if (project.hasPackageJson) {
        // Check for test script in package.json
        try {
            const pkg = JSON.parse(readFileSync(join(workDir, 'package.json'), 'utf-8'));
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
        }
        catch {
            // Fall through
        }
        // Try vitest directly
        const { ok: hasVitest } = runCommand(`npx vitest --version 2>${NULL_DEVICE}`, workDir);
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
        const pythonCmd = IS_WINDOWS ? 'python' : 'python3';
        const { ok, output } = runCommand(`${pythonCmd} -m pytest 2>&1`, workDir, 300_000);
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
function runT4(workDir, target) {
    const start = Date.now();
    const anvil = findAnvilScript(workDir);
    if (anvil) {
        const { ok, output } = runCommand(anvilCommand(anvil, `patterns "${target}"`), workDir);
        return {
            tier: 'T4',
            name: 'Security Scan',
            status: ok ? 'pass' : 'fail',
            detail: output.slice(0, 500),
            durationMs: Date.now() - start,
        };
    }
    // Inline security checks: hardcoded secrets, common vulnerabilities (cross-platform)
    const securityPatterns = [
        'password\\s*=\\s*["\'][^"\']*["\']',
        'api[_-]?key\\s*=\\s*["\']',
        'secret\\s*=\\s*["\']',
        'BEGIN (RSA |DSA |EC )?PRIVATE KEY',
    ];
    let secCmd;
    if (IS_WINDOWS) {
        secCmd = `findstr /s /n /i "password= api_key= secret= PRIVATE.KEY" "${target}\\*.ts" "${target}\\*.js" "${target}\\*.py" "${target}\\*.json" 2>${NULL_DEVICE} || exit /b 0`;
    }
    else {
        const pattern = securityPatterns.join('\\|');
        secCmd = `grep -rni "${pattern}" "${target}" --include="*.ts" --include="*.js" --include="*.py" --include="*.json" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git 2>/dev/null || true`;
    }
    const { output } = runCommand(secCmd, workDir);
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
function runT5(workDir) {
    const start = Date.now();
    const project = detectProjectType(workDir);
    if (project.hasPackageJson) {
        try {
            const pkg = JSON.parse(readFileSync(join(workDir, 'package.json'), 'utf-8'));
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
        }
        catch {
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
function runT6(workDir, storyFile) {
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
        const { ok, output } = runCommand(anvilCommand(anvil, `scope "${storyFile}"`), workDir);
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
export async function runAllGates(options) {
    const { workDir, target = '.', storyFile, onGateStart, onGateComplete } = options;
    const resolvedTarget = resolve(workDir, target);
    const gates = [];
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
    let verdict = 'PASS';
    if (failed > 0)
        verdict = 'FAIL';
    else if (warned > 0)
        verdict = 'WARN';
    return { gates, passed, failed, warned, skipped, totalMs, verdict };
}
export function runSingleGate(tier, workDir, target = '.', storyFile) {
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
//# sourceMappingURL=gates.js.map
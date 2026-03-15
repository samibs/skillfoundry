import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
const DEFAULT_HOOKS_CONFIG = `[hooks]
enabled = true

[hooks.pre-commit]
gates = ["t0", "t1"]
fail_action = "block"
timeout_seconds = 10

[hooks.pre-push]
gates = ["t2", "t4"]
fail_action = "block"
timeout_seconds = 60

[hooks.options]
backup_existing = true
color_output = true
verbose = false
`;
function parseHooksConfig(workDir) {
    const configPath = join(workDir, '.skillfoundry', 'hooks.toml');
    // Default config
    const config = {
        'pre-commit': { gates: ['t0', 't1'], fail_action: 'block', timeout_seconds: 10 },
        'pre-push': { gates: ['t2', 't4'], fail_action: 'block', timeout_seconds: 60 },
        options: { backup_existing: true },
    };
    if (!existsSync(configPath))
        return config;
    try {
        const content = readFileSync(configPath, 'utf-8');
        // Simple TOML-ish parsing for our specific structure
        const preCommitGates = content.match(/\[hooks\.pre-commit\][\s\S]*?gates\s*=\s*\[([^\]]*)\]/);
        if (preCommitGates) {
            config['pre-commit'].gates = preCommitGates[1].split(',').map((s) => s.trim().replace(/"/g, '')).filter(Boolean);
        }
        const prePushGates = content.match(/\[hooks\.pre-push\][\s\S]*?gates\s*=\s*\[([^\]]*)\]/);
        if (prePushGates) {
            config['pre-push'].gates = prePushGates[1].split(',').map((s) => s.trim().replace(/"/g, '')).filter(Boolean);
        }
    }
    catch {
        // Use defaults
    }
    return config;
}
const VALID_GATE_PATTERN = /^t[0-6]$/;
function generateHookScript(hookType, gates, failAction, timeoutSec) {
    const safeGates = gates.filter((g) => VALID_GATE_PATTERN.test(g));
    const safeTimeout = Math.max(1, Math.min(Math.floor(Number(timeoutSec) || 10), 300));
    const safeFail = failAction === 'warn' ? 'warn' : 'block';
    const gateArgs = safeGates.map((g) => `"${g}"`).join(' ');
    return `#!/bin/sh
# SkillFoundry quality gate hook (${hookType})
# Auto-generated — edit .skillfoundry/hooks.toml to configure

SF_CLI=""
if command -v sf >/dev/null 2>&1; then
  SF_CLI="sf"
elif [ -f "./sf_cli/bin/sf.js" ]; then
  SF_CLI="node ./sf_cli/bin/sf.js"
elif command -v npx >/dev/null 2>&1; then
  SF_CLI="npx skillfoundry"
fi

if [ -z "$SF_CLI" ]; then
  echo "[SkillFoundry] sf command not found — skipping ${hookType} gates"
  exit 0
fi

FAILED=0
for GATE in ${gateArgs}; do
  echo "[SkillFoundry] Running gate $GATE..."
  timeout ${safeTimeout} $SF_CLI gate "$GATE" . 2>/dev/null
  if [ $? -ne 0 ]; then
    echo "[SkillFoundry] Gate $GATE FAILED"
    FAILED=1
  fi
done

if [ "$FAILED" = "1" ]; then
  echo ""
  echo "[SkillFoundry] Quality gate(s) failed."
  ${safeFail === 'block' ? 'echo "Commit blocked. Fix issues or use --no-verify to bypass."' : 'echo "Warning: quality gate(s) failed."'}
  ${safeFail === 'block' ? 'exit 1' : 'exit 0'}
fi

exit 0
`;
}
export const hookCommand = {
    name: 'hook',
    description: 'Install or uninstall git quality gate hooks',
    usage: '/hook install [--force] | /hook uninstall | /hook status',
    execute: async (args, session) => {
        const parts = args.trim().split(/\s+/);
        const action = parts[0] || 'status';
        const force = parts.includes('--force');
        const gitDir = join(session.workDir, '.git');
        if (!existsSync(gitDir)) {
            return 'Not a git repository. Initialize with `git init` first.';
        }
        const hooksDir = join(gitDir, 'hooks');
        const sfDir = join(session.workDir, '.skillfoundry');
        if (action === 'install') {
            // Ensure config exists
            if (!existsSync(join(sfDir, 'hooks.toml'))) {
                mkdirSync(sfDir, { recursive: true });
                writeFileSync(join(sfDir, 'hooks.toml'), DEFAULT_HOOKS_CONFIG);
            }
            const config = parseHooksConfig(session.workDir);
            mkdirSync(hooksDir, { recursive: true });
            const installed = [];
            const hookTypes = ['pre-commit', 'pre-push'];
            for (const hookType of hookTypes) {
                const hookPath = join(hooksDir, hookType);
                const hookConfig = config[hookType];
                if (hookConfig.gates.length === 0)
                    continue;
                // Backup existing hook
                if (existsSync(hookPath) && !force) {
                    const content = readFileSync(hookPath, 'utf-8');
                    if (!content.includes('SkillFoundry')) {
                        if (config.options.backup_existing) {
                            copyFileSync(hookPath, hookPath + '.bak');
                        }
                    }
                }
                // Write hook script
                const script = generateHookScript(hookType, hookConfig.gates, hookConfig.fail_action, hookConfig.timeout_seconds);
                writeFileSync(hookPath, script, { mode: 0o755 });
                try {
                    chmodSync(hookPath, 0o755);
                }
                catch {
                    // chmod may fail on Windows — non-critical
                }
                installed.push(`${hookType}: gates [${hookConfig.gates.join(', ')}] — ${hookConfig.fail_action}`);
            }
            if (installed.length === 0) {
                return 'No hooks configured. Edit .skillfoundry/hooks.toml to add gates.';
            }
            return [
                '**Git Hooks Installed**',
                '',
                ...installed.map((h) => `  ✓ ${h}`),
                '',
                '  Config: .skillfoundry/hooks.toml',
                '  Bypass: git commit --no-verify',
            ].join('\n');
        }
        if (action === 'uninstall') {
            const removed = [];
            for (const hookType of ['pre-commit', 'pre-push']) {
                const hookPath = join(hooksDir, hookType);
                if (existsSync(hookPath)) {
                    const content = readFileSync(hookPath, 'utf-8');
                    if (content.includes('SkillFoundry')) {
                        // Restore backup if exists
                        const bakPath = hookPath + '.bak';
                        if (existsSync(bakPath)) {
                            copyFileSync(bakPath, hookPath);
                            require('node:fs').unlinkSync(bakPath);
                            removed.push(`${hookType}: restored from backup`);
                        }
                        else {
                            require('node:fs').unlinkSync(hookPath);
                            removed.push(`${hookType}: removed`);
                        }
                    }
                }
            }
            if (removed.length === 0)
                return 'No SkillFoundry hooks found to remove.';
            return ['**Hooks Removed**', '', ...removed.map((r) => `  ✓ ${r}`)].join('\n');
        }
        // Status
        const status = ['**Hook Status**', ''];
        for (const hookType of ['pre-commit', 'pre-push']) {
            const hookPath = join(hooksDir, hookType);
            if (existsSync(hookPath)) {
                const content = readFileSync(hookPath, 'utf-8');
                const isSf = content.includes('SkillFoundry');
                status.push(`  ${hookType}: ${isSf ? '✓ SkillFoundry' : '✗ Other (not SF)'}`);
            }
            else {
                status.push(`  ${hookType}: not installed`);
            }
        }
        const configPath = join(sfDir, 'hooks.toml');
        status.push('');
        status.push(`  Config: ${existsSync(configPath) ? configPath : 'not found (will use defaults)'}`);
        return status.join('\n');
    },
};
//# sourceMappingURL=hook.js.map
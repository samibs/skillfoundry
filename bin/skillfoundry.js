#!/usr/bin/env node

// skillfoundry CLI — lightweight project initializer
// Usage:
//   npx skillfoundry init                  Initialize SkillFoundry in the current project
//   npx skillfoundry init --platform=claude,cursor   Specify platforms
//   npx skillfoundry init --yes            Non-interactive mode

import { execSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync, cpSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FRAMEWORK_ROOT = resolve(__dirname, '..');
const VERSION = readFileSync(join(FRAMEWORK_ROOT, '.version'), 'utf-8').trim();

const HELP = `
skillfoundry v${VERSION} — AI engineering framework

Usage:
  skillfoundry init [options]       Install SkillFoundry into the current project
  skillfoundry version              Show version
  skillfoundry help                 Show this help

Init options:
  --platform=<list>    Comma-separated platforms: claude,cursor,copilot,codex,gemini (default: claude)
  --yes, -y            Non-interactive mode (accept defaults)

CLI commands (after install, use 'sf'):
  sf metrics baseline              Capture a quality baseline snapshot of the current project
  sf report --html                 Generate a self-contained HTML quality report
  sf dashboard                     Multi-project dashboard — overview, sync, drill-down
  sf dashboard serve               Start web dashboard (http://127.0.0.1:9400)
  sf dashboard trend               KPI trend report with forecasting
  sf dashboard remediate           Auto-remediation engine with playbooks

Examples:
  npx skillfoundry init
  npx skillfoundry init --platform=claude,cursor,copilot
  npx skillfoundry init --yes

Documentation:
  https://skillfoundry.dev/docs     Full docs (Docusaurus)
`;

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(HELP);
    process.exit(0);
  }

  if (command === 'version' || command === '--version' || command === '-v') {
    console.log(`skillfoundry v${VERSION}`);
    process.exit(0);
  }

  if (command === 'init') {
    runInit(args.slice(1));
  } else {
    console.error(`Unknown command: ${command}\nRun 'skillfoundry help' for usage.`);
    process.exit(1);
  }
}

function runInit(args) {
  const projectDir = process.cwd();
  const flags = parseFlags(args);

  console.log(`\n  ◆ SkillFoundry v${VERSION} — Project Initializer\n`);

  // Validate project directory
  if (!existsSync(join(projectDir, '.git'))) {
    console.log('  ⚠  No .git directory found. Consider running "git init" first.');
  }

  // Check if already initialized — config.toml exists AND at least one platform dir
  if (existsSync(join(projectDir, '.skillfoundry', 'config.toml'))) {
    const hasPlatformDir =
      existsSync(join(projectDir, '.claude')) ||
      existsSync(join(projectDir, '.copilot')) ||
      existsSync(join(projectDir, '.cursor')) ||
      existsSync(join(projectDir, '.agents', 'skills')) ||
      existsSync(join(projectDir, '.gemini', 'skills')) ||
      existsSync(join(projectDir, 'CLAUDE.md'));

    if (hasPlatformDir) {
      console.log('  ℹ  SkillFoundry is already initialized in this project.');
      console.log('     Run the update script to refresh: update.sh or update.ps1\n');
      process.exit(0);
    } else {
      console.log('  ⚠  Incomplete installation detected (config exists but no platform files).');
      console.log('     Re-running installer...\n');
    }
  }

  const platform = flags.platform || 'claude';
  const nonInteractive = flags.yes || flags.y;

  console.log(`  Project:   ${projectDir}`);
  console.log(`  Platforms: ${platform}`);
  console.log(`  Framework: ${FRAMEWORK_ROOT}\n`);

  // Delegate to install.sh (Linux/macOS) or install.ps1 (Windows)
  const isWindows = process.platform === 'win32';
  const installScript = isWindows
    ? join(FRAMEWORK_ROOT, 'install.ps1')
    : join(FRAMEWORK_ROOT, 'install.sh');

  if (!existsSync(installScript)) {
    console.error(`  ✗  Install script not found: ${installScript}`);
    console.error('     Ensure the framework is fully installed.\n');
    process.exit(1);
  }

  console.log('  ▸  Running installer...\n');

  try {
    if (isWindows) {
      // PowerShell uses -ParamName syntax, not --param=value
      const psArgs = [
        `-Platform "${platform}"`,
        `-TargetDir "${projectDir}"`,
      ];
      if (nonInteractive) {
        psArgs.push('-Yes');
      }
      execSync(
        `powershell -ExecutionPolicy Bypass -File "${installScript}" ${psArgs.join(' ')}`,
        { stdio: 'inherit', cwd: projectDir },
      );
    } else {
      const shArgs = [`--platform=${platform}`];
      if (nonInteractive) {
        shArgs.push('-y');
      }
      shArgs.push(projectDir);
      execSync(
        `bash "${installScript}" ${shArgs.map(a => `"${a}"`).join(' ')}`,
        { stdio: 'inherit', cwd: projectDir },
      );
    }
  } catch (err) {
    console.error('\n  ✗  Installation failed. Check the output above for details.\n');
    process.exit(1);
  }

  console.log('\n  ✓  SkillFoundry initialized successfully!\n');
  console.log('  Next steps:');
  console.log('    1. /prd "your feature idea"     — Write requirements');
  console.log('    2. /forge                        — Build with quality gates');
  console.log('    3. sf                            — Launch standalone CLI (optional)\n');
}

function parseFlags(args) {
  const flags = {};
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, ...valueParts] = arg.slice(2).split('=');
      flags[key] = valueParts.length > 0 ? valueParts.join('=') : true;
    } else if (arg === '-y') {
      flags.yes = true;
    }
  }
  return flags;
}

main();

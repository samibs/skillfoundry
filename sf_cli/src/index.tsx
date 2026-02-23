import React from 'react';
import { render } from 'ink';
import { Command } from 'commander';
import { App } from './app.js';
import { createDefaultFiles, ensureWorkspace } from './core/config.js';
import { ensureRenderer } from './utils/markdown.js';

const program = new Command()
  .name('sf')
  .description(
    'SkillFoundry interactive CLI — AI-assisted development with governance',
  )
  .version('0.1.0');

program
  .command('init')
  .description('Initialize workspace with default config and policy files')
  .option('--force', 'Regenerate default config files')
  .action((opts: { force?: boolean }) => {
    const workDir = process.cwd();
    createDefaultFiles(workDir, opts.force ?? false);
    console.log('[OK] Workspace initialized at .skillfoundry/');
  });

// Default command: launch interactive REPL
program.action(async () => {
  const workDir = process.cwd();
  ensureWorkspace(workDir);
  await ensureRenderer();
  render(<App workDir={workDir} />);
});

program.parse(process.argv);

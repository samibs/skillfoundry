#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Auto-detect framework root if the shell wrapper didn't set it.
// bin/sf.js is at <framework>/sf_cli/bin/sf.js
// So framework root is two levels up: bin/ -> sf_cli/ -> framework root
if (!process.env.SF_FRAMEWORK_ROOT) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  process.env.SF_FRAMEWORK_ROOT = join(__dirname, '..', '..');
}

import('../dist/index.js').catch((err) => {
  console.error('[sf] Fatal:', err instanceof Error ? err.message : String(err));
  // A plain `git pull` updates package.json but not node_modules, so a newly added
  // dependency crashes every command at import time. Tell the user how to recover.
  if (err && err.code === 'ERR_MODULE_NOT_FOUND') {
    const cliDir = join(process.env.SF_FRAMEWORK_ROOT, 'sf_cli');
    const updateScript = process.platform === 'win32' ? '.\\update.ps1' : './update.sh';
    // One command per line: `&&` chaining fails in Windows PowerShell 5.1.
    console.error('[sf] A dependency or build file is missing — usually after updating with `git pull`.');
    console.error('[sf] Fix: run these three commands, one at a time:');
    console.error(`       cd "${cliDir}"`);
    console.error('       npm ci');
    console.error('       npm run build');
    console.error(`[sf] Or update with ${updateScript}, which reinstalls and rebuilds automatically.`);
  }
  process.exit(1);
});

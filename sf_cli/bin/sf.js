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

import('../dist/index.js');

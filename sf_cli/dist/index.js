import { jsx as _jsx } from "react/jsx-runtime";
import { render } from 'ink';
import { Command } from 'commander';
import { App } from './app.js';
import { createDefaultFiles, ensureWorkspace } from './core/config.js';
import { ensureRenderer } from './utils/markdown.js';
import { getFrameworkVersion } from './core/framework.js';
import { injectCredentials, hasAnyCredentials } from './core/credentials.js';
import { runSetupNonInteractive, runInteractiveSetup } from './commands/setup.js';
import { printBanner } from './core/banner.js';
// Inject stored credentials into process.env before any provider initialization
injectCredentials();
let cliVersion = '2.0.0';
try {
    cliVersion = getFrameworkVersion();
}
catch {
    // Use fallback version
}
const program = new Command()
    .name('sf')
    .description('SkillFoundry interactive CLI — AI-assisted development with governance')
    .version(cliVersion);
program
    .command('init')
    .description('Initialize workspace with default config and policy files')
    .option('--force', 'Regenerate default config files')
    .action((opts) => {
    const workDir = process.cwd();
    createDefaultFiles(workDir, opts.force ?? false);
    console.log('[OK] Workspace initialized at .skillfoundry/');
});
program
    .command('setup')
    .description('Configure API keys for AI providers')
    .option('--provider <name>', 'Provider to configure (anthropic, openai, xai, gemini, ollama)')
    .option('--key <key>', 'API key value')
    .option('--auth-token <token>', 'Auth token (Anthropic bearer token)')
    .option('--remove', 'Remove stored credentials for the provider')
    .option('--list', 'List all configured providers')
    .action((opts) => {
    console.log(runSetupNonInteractive(opts));
});
// Default command: launch interactive REPL
program.action(async () => {
    printBanner();
    const workDir = process.cwd();
    ensureWorkspace(workDir);
    // First-run: if no credentials detected, launch interactive setup
    if (!hasAnyCredentials()) {
        const result = await runInteractiveSetup();
        if (result === 'quit') {
            process.exit(0);
        }
    }
    await ensureRenderer();
    const { waitUntilExit } = render(_jsx(App, { workDir: workDir }));
    await waitUntilExit();
});
program.parseAsync(process.argv).catch((err) => {
    console.error('[ERROR]', err instanceof Error ? err.message : String(err));
    process.exit(1);
});
//# sourceMappingURL=index.js.map
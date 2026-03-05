// Framework root discovery — resolves the path where SkillFoundry framework is installed.
// Priority: SF_FRAMEWORK_ROOT env var > file-based detection from compiled module location.
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
let _cachedFrameworkRoot = null;
/**
 * Resolve the absolute path to the SkillFoundry framework root.
 *
 * Detection order:
 *   1. SF_FRAMEWORK_ROOT environment variable (set by the shell wrapper)
 *   2. File-based: walk up from this module's compiled location
 *      dist/core/framework.js -> dist/ -> sf_cli/ -> framework root
 */
export function getFrameworkRoot() {
    if (_cachedFrameworkRoot)
        return _cachedFrameworkRoot;
    // 1. Environment variable (set by shell wrapper or user)
    const envRoot = process.env.SF_FRAMEWORK_ROOT;
    if (envRoot) {
        const resolved = resolve(envRoot);
        if (validateFrameworkRoot(resolved)) {
            _cachedFrameworkRoot = resolved;
            return resolved;
        }
        // Env var set but invalid — warn and fall through
        console.error(`[WARN] SF_FRAMEWORK_ROOT="${envRoot}" is not a valid framework directory. Falling back to auto-detection.`);
    }
    // 2. File-based detection from this module's location
    //    At runtime: <framework>/sf_cli/dist/core/framework.js
    //    dirname x1 = dist/core/ -> dist/
    //    dirname x2 = dist/ -> sf_cli/
    //    dirname x3 = sf_cli/ -> framework root
    const thisFile = fileURLToPath(import.meta.url);
    const sfCliDir = dirname(dirname(dirname(thisFile))); // -> sf_cli/
    const candidate = dirname(sfCliDir); // -> framework root
    if (validateFrameworkRoot(candidate)) {
        _cachedFrameworkRoot = candidate;
        return candidate;
    }
    throw new Error('Cannot determine SkillFoundry framework root. ' +
        'Set SF_FRAMEWORK_ROOT environment variable or run from within the framework directory.');
}
/**
 * Validate that a directory looks like a SkillFoundry framework root.
 */
function validateFrameworkRoot(dir) {
    // A valid framework root must have the sf_cli directory
    // (the .version file is optional — may not exist during development)
    return existsSync(join(dir, 'sf_cli'));
}
/**
 * Get the path to the anvil script in the framework root.
 * On Windows, looks for .ps1/.cmd; on Unix, looks for .sh or extensionless.
 * Returns null if the script does not exist.
 */
export function getAnvilScript() {
    const root = getFrameworkRoot();
    const isWindows = process.platform === 'win32';
    const extensions = isWindows
        ? ['anvil.ps1', 'anvil.cmd']
        : ['anvil.sh', 'anvil'];
    for (const ext of extensions) {
        const path = join(root, 'scripts', ext);
        if (existsSync(path))
            return path;
    }
    return null;
}
/**
 * Read the framework version from .version file.
 * Falls back to package.json version, then '0.0.0'.
 */
export function getFrameworkVersion() {
    try {
        const root = getFrameworkRoot();
        const versionFile = join(root, '.version');
        if (existsSync(versionFile)) {
            return readFileSync(versionFile, 'utf-8').trim();
        }
        const pkgFile = join(root, 'sf_cli', 'package.json');
        if (existsSync(pkgFile)) {
            const pkg = JSON.parse(readFileSync(pkgFile, 'utf-8'));
            return pkg.version || '0.0.0';
        }
    }
    catch {
        // Framework root not available
    }
    return '0.0.0';
}
/**
 * Reset cached framework root — used in testing.
 */
export function _resetFrameworkRootCache() {
    _cachedFrameworkRoot = null;
}
//# sourceMappingURL=framework.js.map
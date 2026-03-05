/**
 * Resolve the absolute path to the SkillFoundry framework root.
 *
 * Detection order:
 *   1. SF_FRAMEWORK_ROOT environment variable (set by the shell wrapper)
 *   2. File-based: walk up from this module's compiled location
 *      dist/core/framework.js -> dist/ -> sf_cli/ -> framework root
 */
export declare function getFrameworkRoot(): string;
/**
 * Get the path to the anvil script in the framework root.
 * On Windows, looks for .ps1/.cmd; on Unix, looks for .sh or extensionless.
 * Returns null if the script does not exist.
 */
export declare function getAnvilScript(): string | null;
/**
 * Read the framework version from .version file.
 * Falls back to package.json version, then '0.0.0'.
 */
export declare function getFrameworkVersion(): string;
/**
 * Reset cached framework root — used in testing.
 */
export declare function _resetFrameworkRootCache(): void;

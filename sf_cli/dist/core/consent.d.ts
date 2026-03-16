export type ConsentStatus = 'opted_in' | 'opted_out' | 'pending';
/**
 * Get the current telemetry consent status.
 * Reads the [telemetry] section from .skillfoundry/config.toml.
 * Returns 'pending' if the section or consent field is missing.
 *
 * @param workDir - Project root directory
 * @returns 'opted_in' | 'opted_out' | 'pending'
 */
export declare function getConsentStatus(workDir: string): ConsentStatus;
/**
 * Set telemetry consent choice.
 * Writes/updates the [telemetry] section in .skillfoundry/config.toml.
 * Creates the config file and directory if they don't exist.
 *
 * @param workDir - Project root directory
 * @param choice - 'opted_in' or 'opted_out'
 */
export declare function setConsent(workDir: string, choice: 'opted_in' | 'opted_out'): void;
/**
 * Prompt the user for telemetry consent.
 * Returns early if consent has already been given.
 * Non-interactive environments (no TTY) default to 'opted_out'.
 *
 * @param workDir - Project root directory
 * @returns The consent choice
 */
export declare function promptConsent(workDir: string): Promise<ConsentStatus>;
/**
 * Clear the in-memory consent cache. Used for testing.
 */
export declare function clearConsentCache(): void;

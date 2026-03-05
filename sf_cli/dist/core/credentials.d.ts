/**
 * Maps provider TOML fields to environment variable names.
 * The SDK constructors read these env vars automatically.
 */
export declare const PROVIDER_ENV_MAPPING: Record<string, Record<string, string>>;
/**
 * URLs where users can obtain API keys for each provider.
 */
export declare const PROVIDER_KEY_URLS: Record<string, string>;
export interface ProviderCredentials {
    api_key?: string;
    auth_token?: string;
    base_url?: string;
}
export type CredentialStore = Record<string, ProviderCredentials>;
/**
 * Load credentials from ~/.config/skillfoundry/credentials.toml.
 * Returns empty store if file does not exist.
 */
export declare function loadCredentials(): CredentialStore;
/**
 * Save credentials to disk with secure permissions (0o600).
 */
export declare function saveCredentials(store: CredentialStore): void;
/**
 * Set a credential for a specific provider. Merges with existing entries.
 */
export declare function setCredential(provider: string, field: string, value: string): void;
/**
 * Remove all credentials for a provider.
 */
export declare function removeCredential(provider: string): void;
/**
 * Inject stored credentials into process.env so SDK constructors work.
 * Does NOT overwrite existing env vars — env vars always take precedence.
 */
export declare function injectCredentials(): void;
/**
 * Returns the path to the credentials file (for display in messages).
 */
export declare function getCredentialsPath(): string;
/**
 * Check if any provider has credentials available (env or stored).
 */
export declare function hasAnyCredentials(): boolean;

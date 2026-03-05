/**
 * Clear the health check cache (useful for testing).
 */
export declare function clearHealthCache(): void;
/**
 * Returns true if the provider runs locally (on localhost).
 */
export declare function isLocalProvider(provider: string): boolean;
/**
 * Get the base URL for a local provider.
 */
export declare function getLocalBaseUrl(provider: string): string;
/**
 * Ping a local provider to check if it's running.
 * Uses a 500ms timeout to avoid blocking.
 * Caches the result for 60 seconds.
 */
export declare function pingProvider(provider: string): Promise<boolean>;
export interface LocalModel {
    id: string;
    name: string;
    owned_by?: string;
}
/**
 * Query the local provider's /v1/models endpoint to discover available models.
 * Returns empty array if the provider is offline or doesn't support model listing.
 */
export declare function listLocalModels(provider: string): Promise<LocalModel[]>;
export interface HealthCheckResult {
    provider: string;
    healthy: boolean;
    fallbackUsed: boolean;
    fallbackProvider?: string;
    warning?: string;
}
/**
 * Check if a provider is healthy. If it's a local provider that's offline,
 * return the fallback cloud provider with a warning message.
 */
export declare function resolveProvider(provider: string, fallbackProvider?: string): Promise<HealthCheckResult>;

import type { ProviderAdapter } from '../types.js';
export interface RetryResult<T> {
    result: T;
    fallbackUsed?: string;
}
/**
 * Execute a provider operation with retry + fallback.
 * @param fn - async function that takes a ProviderAdapter and returns a result
 * @param primary - primary provider
 * @param fallback - optional fallback provider (used if primary exhausts retries)
 */
export declare function streamWithRetry<T>(fn: (provider: ProviderAdapter) => Promise<T>, primary: ProviderAdapter, fallback: ProviderAdapter | null): Promise<RetryResult<T>>;

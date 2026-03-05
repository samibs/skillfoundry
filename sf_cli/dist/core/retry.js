// Retry with exponential backoff + fallback provider support.
// Non-retryable errors (auth, validation) fail immediately.
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
// Errors that should NOT be retried (fail immediately)
const NON_RETRYABLE = /401|403|404|authentication|unauthorized|invalid.*key|api.*key.*missing|model.*not.*found|model.*not.*available|does not have access|do not have access|no access.*model|model.*does not exist|not available.*model|unsupported.*model|unknown.*model|insufficient.*quota|billing|payment.*required/i;
function isRetryable(err) {
    const message = err instanceof Error ? err.message : String(err);
    return !NON_RETRYABLE.test(message);
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Execute a provider operation with retry + fallback.
 * @param fn - async function that takes a ProviderAdapter and returns a result
 * @param primary - primary provider
 * @param fallback - optional fallback provider (used if primary exhausts retries)
 */
export async function streamWithRetry(fn, primary, fallback) {
    let lastError;
    // Try primary with retries
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const result = await fn(primary);
            return { result };
        }
        catch (err) {
            lastError = err;
            if (!isRetryable(err)) {
                // Non-retryable: try fallback immediately if available
                break;
            }
            if (attempt < MAX_RETRIES - 1) {
                const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
                await delay(delayMs);
            }
        }
    }
    // Try fallback provider (single attempt, no retry)
    if (fallback) {
        try {
            const result = await fn(fallback);
            return { result, fallbackUsed: fallback.name };
        }
        catch {
            // Fallback also failed — throw the original error
        }
    }
    throw lastError;
}
//# sourceMappingURL=retry.js.map
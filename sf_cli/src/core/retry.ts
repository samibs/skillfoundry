// Retry with exponential backoff + fallback provider support.
// Non-retryable errors (auth, validation) fail immediately.

import type { ProviderAdapter } from '../types.js';
import { getLogger } from '../utils/logger.js';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

// Errors that should NOT be retried (fail immediately)
const NON_RETRYABLE =
  /401|403|404|authentication|unauthorized|invalid.*key|api.*key.*missing|model.*not.*found|model.*not.*available|does not have access|do not have access|no access.*model|model.*does not exist|not available.*model|unsupported.*model|unknown.*model|insufficient.*quota|billing|payment.*required/i;

function isRetryable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return !NON_RETRYABLE.test(message);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
export async function streamWithRetry<T>(
  fn: (provider: ProviderAdapter) => Promise<T>,
  primary: ProviderAdapter,
  fallback: ProviderAdapter | null,
): Promise<RetryResult<T>> {
  const log = getLogger();
  let lastError: unknown;

  // Try primary with retries
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await fn(primary);
      return { result };
    } catch (err) {
      lastError = err;
      const errMsg = err instanceof Error ? err.message : String(err);
      if (!isRetryable(err)) {
        // Non-retryable: try fallback immediately if available
        log.warn('provider', 'retry_skip', { attempt: attempt + 1, error: errMsg, reason: 'non-retryable' });
        break;
      }
      if (attempt < MAX_RETRIES - 1) {
        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
        log.warn('provider', 'retry_attempt', { attempt: attempt + 1, maxRetries: MAX_RETRIES, delayMs, error: errMsg });
        await delay(delayMs);
      }
    }
  }

  // Try fallback provider (single attempt, no retry)
  if (fallback) {
    log.warn('provider', 'fallback_attempt', { fallback: fallback.name });
    try {
      const result = await fn(fallback);
      return { result, fallbackUsed: fallback.name };
    } catch {
      // Fallback also failed — throw the original error
    }
  }

  log.error('provider', 'retries_exhausted', {
    provider: primary.name,
    attempts: MAX_RETRIES,
    lastError: lastError instanceof Error ? lastError.message : String(lastError),
  });

  throw lastError;
}

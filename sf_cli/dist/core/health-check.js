// Provider health check — pings local provider endpoints before first request.
// Caches results to avoid per-turn latency. Falls back to cloud on failure.
//
// Implements FR-009 through FR-011 of the local-first-development PRD.
import { AVAILABLE_PROVIDERS } from './provider.js';
const healthCache = new Map();
const CACHE_TTL_MS = 60_000; // 60 seconds
/**
 * Clear the health check cache (useful for testing).
 */
export function clearHealthCache() {
    healthCache.clear();
}
// ── Local Provider Detection ────────────────────────────────────────
const LOCAL_PROVIDERS = ['ollama', 'lmstudio'];
/**
 * Returns true if the provider runs locally (on localhost).
 */
export function isLocalProvider(provider) {
    return LOCAL_PROVIDERS.includes(provider);
}
/**
 * Get the base URL for a local provider.
 */
export function getLocalBaseUrl(provider) {
    switch (provider) {
        case 'ollama':
            return process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1';
        case 'lmstudio':
            return process.env.LMSTUDIO_BASE_URL || 'http://localhost:1234/v1';
        default:
            return '';
    }
}
// ── Health Check ────────────────────────────────────────────────────
const PING_TIMEOUT_MS = 500;
/**
 * Ping a local provider to check if it's running.
 * Uses a 500ms timeout to avoid blocking.
 * Caches the result for 60 seconds.
 */
export async function pingProvider(provider) {
    // Check cache first
    const cached = healthCache.get(provider);
    if (cached && Date.now() - cached.checkedAt < CACHE_TTL_MS) {
        return cached.healthy;
    }
    if (!isLocalProvider(provider)) {
        // Cloud providers are assumed healthy (their errors are handled by retry logic)
        return true;
    }
    const baseUrl = getLocalBaseUrl(provider);
    if (!baseUrl)
        return false;
    // Strip /v1 suffix for the health check — some servers respond on root only
    const healthUrl = baseUrl.replace(/\/v1\/?$/, '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
    try {
        const response = await fetch(healthUrl, {
            method: 'GET',
            signal: controller.signal,
        });
        clearTimeout(timer);
        const healthy = response.ok || response.status === 200;
        healthCache.set(provider, { healthy, checkedAt: Date.now() });
        return healthy;
    }
    catch {
        clearTimeout(timer);
        // Connection refused, timeout, or other network error
        healthCache.set(provider, { healthy: false, checkedAt: Date.now() });
        return false;
    }
}
/**
 * Query the local provider's /v1/models endpoint to discover available models.
 * Returns empty array if the provider is offline or doesn't support model listing.
 */
export async function listLocalModels(provider) {
    if (!isLocalProvider(provider))
        return [];
    const baseUrl = getLocalBaseUrl(provider);
    if (!baseUrl)
        return [];
    const modelsUrl = `${baseUrl}/models`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    try {
        const response = await fetch(modelsUrl, {
            method: 'GET',
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (!response.ok)
            return [];
        const data = (await response.json());
        if (!data.data || !Array.isArray(data.data))
            return [];
        return data.data.map((m) => ({
            id: m.id,
            name: m.id,
            owned_by: m.owned_by,
        }));
    }
    catch {
        clearTimeout(timer);
        return [];
    }
}
/**
 * Check if a provider is healthy. If it's a local provider that's offline,
 * return the fallback cloud provider with a warning message.
 */
export async function resolveProvider(provider, fallbackProvider) {
    // Cloud providers — always resolve directly
    if (!isLocalProvider(provider)) {
        return { provider, healthy: true, fallbackUsed: false };
    }
    const healthy = await pingProvider(provider);
    if (healthy) {
        return { provider, healthy: true, fallbackUsed: false };
    }
    // Local provider is down — try fallback
    if (fallbackProvider && !isLocalProvider(fallbackProvider)) {
        const providerName = AVAILABLE_PROVIDERS[provider]?.name || provider;
        const fallbackName = AVAILABLE_PROVIDERS[fallbackProvider]?.name || fallbackProvider;
        return {
            provider: fallbackProvider,
            healthy: false,
            fallbackUsed: true,
            fallbackProvider,
            warning: `${providerName} is offline. Falling back to ${fallbackName}.`,
        };
    }
    // No fallback available
    const providerName = AVAILABLE_PROVIDERS[provider]?.name || provider;
    return {
        provider,
        healthy: false,
        fallbackUsed: false,
        warning: `${providerName} is offline. Start your local model server or switch to a cloud provider.`,
    };
}
//# sourceMappingURL=health-check.js.map
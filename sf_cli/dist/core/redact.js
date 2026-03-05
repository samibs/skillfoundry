const REDACT_PATTERNS = [
    /sk-[A-Za-z0-9_-]{20,}/g, // OpenAI keys
    /xai-[A-Za-z0-9_-]{20,}/g, // xAI keys
    /ghp_[A-Za-z0-9]{20,}/g, // GitHub personal tokens
    /ghs_[A-Za-z0-9]{20,}/g, // GitHub app tokens
    /AKIA[A-Z0-9]{12,}/g, // AWS access keys
    /AIza[A-Za-z0-9_-]{30,}/g, // Google API keys
    /sk-ant-[A-Za-z0-9_-]{20,}/g, // Anthropic keys
    /Bearer\s+[A-Za-z0-9._\-]{20,}/g, // Bearer tokens
    /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, // JWT tokens
    /mongodb(\+srv)?:\/\/[^\s]+@[^\s]+/g, // MongoDB connection URIs
    /postgres(ql)?:\/\/[^\s]+@[^\s]+/g, // PostgreSQL connection URIs
    /mysql:\/\/[^\s]+@[^\s]+/g, // MySQL connection URIs
];
export function redactText(input, enabled) {
    if (!enabled)
        return input;
    let result = input;
    for (const pattern of REDACT_PATTERNS) {
        result = result.replace(pattern, '[REDACTED]');
    }
    return result;
}
//# sourceMappingURL=redact.js.map
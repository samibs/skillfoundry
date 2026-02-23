const REDACT_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{20,}/g,         // OpenAI keys
  /xai-[A-Za-z0-9_-]{20,}/g,        // xAI keys
  /ghp_[A-Za-z0-9]{20,}/g,          // GitHub personal tokens
  /ghs_[A-Za-z0-9]{20,}/g,          // GitHub app tokens
  /AKIA[A-Z0-9]{12,}/g,             // AWS access keys
  /AIza[A-Za-z0-9_-]{30,}/g,        // Google API keys
  /sk-ant-[A-Za-z0-9_-]{20,}/g,     // Anthropic keys
];

export function redactText(input: string, enabled: boolean): string {
  if (!enabled) return input;
  let result = input;
  for (const pattern of REDACT_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}

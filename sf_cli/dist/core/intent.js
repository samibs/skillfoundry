// Lightweight intent classifier — no LLM call, just pattern matching.
// Determines whether a user message needs tool access (agent mode) or
// can be answered with a plain chat call (saving ~350 tokens on tool defs).
const AGENT_PATTERNS = [
    // File operations
    /\b(read|open|show|cat|view|display)\s+(the\s+)?(file|code|source|content)/i,
    /\b(write|create|make|generate|save)\s+(a\s+|the\s+|new\s+)?/i,
    /\b(add)\s+\w/i,
    /\b(edit|modify|change|update|fix|patch|refactor)\s/i,
    /\b(delete|remove|rename)\s+(the\s+)?(file|folder|directory)/i,
    // Build / run / test
    /\b(run|execute|build|compile|install|deploy|start|launch|test)\b/i,
    /\bnpm\s/i,
    /\bgit\s/i,
    /\b(lint|format|prettier|eslint)\b/i,
    // Code search
    /\b(search|find|grep|glob|look\s+for|where\s+is)\b/i,
    /\b(import|require|dependency|package)\b/i,
    // File paths and extensions
    /\.(ts|tsx|js|jsx|py|rs|go|java|cs|md|json|toml|yaml|yml|sh|css|html|sql)\b/i,
    /[.\/\\](src|lib|dist|build|test|spec|config|scripts)\//i,
    // Explicit tool requests
    /\b(terminal|shell|command|bash|console)\b/i,
    /\b(project|codebase|repository|repo|workspace)\b/i,
    // Implementation language
    /\b(implement|scaffold|bootstrap|setup|init|configure|wire\s+up|hook\s+up|integrate)\b/i,
    /\b(debug|trace|stack\s*trace|breakpoint|log)\b/i,
    /\b(API|endpoint|route|handler|middleware|controller|service|model|schema|migration)\b/i,
];
// Messages that are almost certainly just chat — skip tools
const CHAT_PATTERNS = [
    /^(hi|hello|hey|ping|pong|thanks|thank you|ok|okay|sure|yes|no|bye|cheers)\s*[!?.]*$/i,
    /^(what|who|why|how|when|where|explain|describe|tell me about|can you)\s/i,
];
export function classifyIntent(message) {
    const trimmed = message.trim();
    // Very short messages (≤3 words) with no code indicators → chat
    const wordCount = trimmed.split(/\s+/).length;
    if (wordCount <= 3) {
        // Unless it matches an agent pattern (e.g. "run tests", "read file.ts")
        if (AGENT_PATTERNS.some((p) => p.test(trimmed))) {
            return 'agent';
        }
        return 'chat';
    }
    // Check if any agent pattern matches
    if (AGENT_PATTERNS.some((p) => p.test(trimmed))) {
        return 'agent';
    }
    // Explicit chat patterns
    if (CHAT_PATTERNS.some((p) => p.test(trimmed))) {
        return 'chat';
    }
    // Default: if the message is longer and doesn't match chat, assume agent
    // (coding assistants are used primarily for coding tasks)
    if (wordCount > 8) {
        return 'agent';
    }
    return 'chat';
}
//# sourceMappingURL=intent.js.map
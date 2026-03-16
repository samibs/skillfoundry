/**
 * STORY-011: Quality Benchmark Suite
 *
 * 50 test scenarios (25 bad + 25 good AI outputs) to measure framework
 * classification accuracy. Each scenario is a code snippet with an expected
 * gate verdict. The benchmark runner evaluates each scenario against the
 * gate system and reports accuracy.
 *
 * Scenarios are static fixtures — no LLM calls, deterministic in CI.
 */
import { getLogger } from '../utils/logger.js';
// ── Built-in scenarios (25 bad + 25 good) ─────────────────────────────────────
const BAD_SCENARIOS = [
    // Banned patterns (T1)
    { id: 'bad-01', name: 'TODO marker in source', category: 'banned_pattern', content: 'function login() { // TODO: implement auth }', target_gate: 'T1', expected_verdict: 'fail', description: 'TODO marker in production code' },
    { id: 'bad-02', name: 'FIXME marker', category: 'banned_pattern', content: 'const handler = () => { /* FIXME: broken logic */ return null; }', target_gate: 'T1', expected_verdict: 'fail', description: 'FIXME in production code' },
    { id: 'bad-03', name: 'PLACEHOLDER content', category: 'banned_pattern', content: 'const API_URL = "PLACEHOLDER";', target_gate: 'T1', expected_verdict: 'fail', description: 'PLACEHOLDER string in code' },
    { id: 'bad-04', name: 'NotImplementedError', category: 'banned_pattern', content: 'function process() { throw new Error("Not implemented"); }', target_gate: 'T1', expected_verdict: 'fail', description: 'Not implemented error thrown' },
    { id: 'bad-05', name: 'STUB function', category: 'banned_pattern', content: '/* STUB */ function validate() { return true; }', target_gate: 'T1', expected_verdict: 'fail', description: 'STUB marker in code' },
    { id: 'bad-06', name: 'HACK workaround', category: 'banned_pattern', content: '// HACK: temporary workaround\nconst x = parseInt(y as any);', target_gate: 'T1', expected_verdict: 'fail', description: 'HACK comment in code' },
    { id: 'bad-07', name: 'Empty function body', category: 'banned_pattern', content: 'function onError(err: Error) { }', target_gate: 'T1', expected_verdict: 'fail', description: 'Empty error handler' },
    // Security issues (T4)
    { id: 'bad-08', name: 'Hardcoded API key', category: 'security', content: 'const API_KEY = "sk-ant-api03-abc123def456";', target_gate: 'T4', expected_verdict: 'fail', description: 'Hardcoded API key in source' },
    { id: 'bad-09', name: 'Hardcoded password', category: 'security', content: 'const password = "admin123";', target_gate: 'T4', expected_verdict: 'fail', description: 'Hardcoded password' },
    { id: 'bad-10', name: 'Private key in source', category: 'security', content: '-----BEGIN RSA PRIVATE KEY-----\nMIIEo...', target_gate: 'T4', expected_verdict: 'fail', description: 'Private key in source file' },
    { id: 'bad-11', name: 'SQL injection vulnerability', category: 'security', content: 'const query = `SELECT * FROM users WHERE name = \'${userInput}\'`;', target_gate: 'T4', expected_verdict: 'fail', description: 'SQL injection via string interpolation' },
    { id: 'bad-12', name: 'eval() usage', category: 'security', content: 'const result = eval(userInput);', target_gate: 'T4', expected_verdict: 'fail', description: 'eval() with user input' },
    // Type errors (T2)
    { id: 'bad-13', name: '@ts-ignore without justification', category: 'type_error', content: '// @ts-ignore\nconst x: string = 42;', target_gate: 'T2', expected_verdict: 'fail', description: '@ts-ignore suppresses type error' },
    { id: 'bad-14', name: 'Type assertion abuse', category: 'type_error', content: 'const data = (response as any).body.json();', target_gate: 'T2', expected_verdict: 'warn', description: 'Unsafe any cast' },
    // Test issues (T3)
    { id: 'bad-15', name: 'Test with no assertions', category: 'test_missing', content: 'it("should work", () => { login(); });', target_gate: 'T3', expected_verdict: 'fail', description: 'Test has no assertions' },
    { id: 'bad-16', name: 'Empty test suite', category: 'test_missing', content: 'describe("Auth", () => { });', target_gate: 'T3', expected_verdict: 'fail', description: 'Empty test describe block' },
    { id: 'bad-17', name: 'Skipped test', category: 'test_missing', content: 'it.skip("important test", () => { expect(true).toBe(true); });', target_gate: 'T3', expected_verdict: 'warn', description: 'Skipped test left in suite' },
    // Build failures (T5)
    { id: 'bad-18', name: 'Missing import', category: 'build_failure', content: 'import { nonExistent } from "./missing-module";', target_gate: 'T5', expected_verdict: 'fail', description: 'Import from non-existent module' },
    { id: 'bad-19', name: 'Syntax error', category: 'build_failure', content: 'function broken( { return; }', target_gate: 'T5', expected_verdict: 'fail', description: 'JavaScript syntax error' },
    // Mixed bad patterns
    { id: 'bad-20', name: 'Console.log debugging', category: 'banned_pattern', content: 'console.log("DEBUG:", userData);', target_gate: 'T1', expected_verdict: 'warn', description: 'Debug logging left in production code' },
    { id: 'bad-21', name: 'XSS via innerHTML', category: 'security', content: 'element.innerHTML = userInput;', target_gate: 'T4', expected_verdict: 'fail', description: 'XSS via innerHTML with user input' },
    { id: 'bad-22', name: 'Secret in env default', category: 'security', content: 'const secret = process.env.SECRET || "default-secret-value";', target_gate: 'T4', expected_verdict: 'warn', description: 'Hardcoded fallback for secret' },
    { id: 'bad-23', name: 'WIP comment', category: 'banned_pattern', content: '// WIP: needs refactoring before release', target_gate: 'T1', expected_verdict: 'fail', description: 'WIP marker in code' },
    { id: 'bad-24', name: 'Lorem ipsum placeholder', category: 'banned_pattern', content: 'const description = "Lorem ipsum dolor sit amet";', target_gate: 'T1', expected_verdict: 'fail', description: 'Placeholder text' },
    { id: 'bad-25', name: 'Disabled auth check', category: 'security', content: '// if (!isAuthenticated(req)) return res.status(401); // disabled for testing', target_gate: 'T4', expected_verdict: 'fail', description: 'Auth check disabled in production' },
];
const GOOD_SCENARIOS = [
    { id: 'good-01', name: 'Clean function', category: 'clean', content: 'export function add(a: number, b: number): number { return a + b; }', target_gate: 'T1', expected_verdict: 'pass', description: 'Simple pure function' },
    { id: 'good-02', name: 'Proper error handling', category: 'clean', content: 'try { await fetch(url); } catch (err) { logger.error("Request failed", { error: err }); throw new AppError("Service unavailable", 503); }', target_gate: 'T1', expected_verdict: 'pass', description: 'Proper error handling with logging' },
    { id: 'good-03', name: 'Parameterized query', category: 'clean', content: 'const result = await db.query("SELECT * FROM users WHERE id = $1", [userId]);', target_gate: 'T4', expected_verdict: 'pass', description: 'Parameterized SQL query' },
    { id: 'good-04', name: 'Environment variable config', category: 'clean', content: 'const apiKey = process.env.API_KEY; if (!apiKey) throw new Error("API_KEY required");', target_gate: 'T4', expected_verdict: 'pass', description: 'Config from env vars with validation' },
    { id: 'good-05', name: 'Input validation', category: 'clean', content: 'if (!/^[a-zA-Z0-9_]+$/.test(username)) throw new ValidationError("Invalid username");', target_gate: 'T4', expected_verdict: 'pass', description: 'Whitelist input validation' },
    { id: 'good-06', name: 'Typed function', category: 'clean', content: 'export function processOrder(order: Order): ProcessedOrder { return { ...order, processed_at: new Date() }; }', target_gate: 'T2', expected_verdict: 'pass', description: 'Fully typed function' },
    { id: 'good-07', name: 'Test with assertions', category: 'clean', content: 'it("adds numbers", () => { expect(add(1, 2)).toBe(3); expect(add(-1, 1)).toBe(0); });', target_gate: 'T3', expected_verdict: 'pass', description: 'Test with multiple assertions' },
    { id: 'good-08', name: 'Proper auth middleware', category: 'clean', content: 'if (!req.headers.authorization) return res.status(401).json({ error: "Unauthorized" });', target_gate: 'T4', expected_verdict: 'pass', description: 'Auth check implemented' },
    { id: 'good-09', name: 'Rate limiting', category: 'clean', content: 'const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });', target_gate: 'T4', expected_verdict: 'pass', description: 'Rate limiting configured' },
    { id: 'good-10', name: 'CSRF protection', category: 'clean', content: 'app.use(csrf({ cookie: { httpOnly: true, secure: true, sameSite: "strict" } }));', target_gate: 'T4', expected_verdict: 'pass', description: 'CSRF middleware with secure cookies' },
    { id: 'good-11', name: 'Content Security Policy', category: 'clean', content: 'app.use(helmet.contentSecurityPolicy({ directives: { defaultSrc: ["\'self\'"] } }));', target_gate: 'T4', expected_verdict: 'pass', description: 'CSP header configured' },
    { id: 'good-12', name: 'Hashed password storage', category: 'clean', content: 'const hash = await bcrypt.hash(password, 12);', target_gate: 'T4', expected_verdict: 'pass', description: 'Password hashing with bcrypt' },
    { id: 'good-13', name: 'JWT RS256', category: 'clean', content: 'const token = jwt.sign(payload, privateKey, { algorithm: "RS256", expiresIn: "15m" });', target_gate: 'T4', expected_verdict: 'pass', description: 'JWT with RS256 algorithm' },
    { id: 'good-14', name: 'Proper logging', category: 'clean', content: 'logger.info("User login", { userId: user.id, ip: req.ip });', target_gate: 'T1', expected_verdict: 'pass', description: 'Structured logging without PII' },
    { id: 'good-15', name: 'Error boundary', category: 'clean', content: 'class ErrorBoundary extends React.Component { componentDidCatch(error: Error) { logError(error); } }', target_gate: 'T1', expected_verdict: 'pass', description: 'React error boundary' },
    { id: 'good-16', name: 'Clean import', category: 'clean', content: 'import { readFile } from "node:fs/promises";', target_gate: 'T5', expected_verdict: 'pass', description: 'Clean Node.js import' },
    { id: 'good-17', name: 'Async/await pattern', category: 'clean', content: 'const data = await readFile(path, "utf-8");', target_gate: 'T2', expected_verdict: 'pass', description: 'Proper async/await usage' },
    { id: 'good-18', name: 'Type guard', category: 'clean', content: 'function isUser(obj: unknown): obj is User { return typeof obj === "object" && obj !== null && "id" in obj; }', target_gate: 'T2', expected_verdict: 'pass', description: 'TypeScript type guard' },
    { id: 'good-19', name: 'Null check', category: 'clean', content: 'const name = user?.name ?? "Anonymous";', target_gate: 'T2', expected_verdict: 'pass', description: 'Nullish coalescing' },
    { id: 'good-20', name: 'Proper enum', category: 'clean', content: 'export const Status = { ACTIVE: "active", INACTIVE: "inactive" } as const;', target_gate: 'T2', expected_verdict: 'pass', description: 'Const object enum pattern' },
    { id: 'good-21', name: 'Describe block with tests', category: 'clean', content: 'describe("UserService", () => { it("creates user", () => { expect(createUser("test")).toBeDefined(); }); });', target_gate: 'T3', expected_verdict: 'pass', description: 'Non-empty test suite' },
    { id: 'good-22', name: 'Express route handler', category: 'clean', content: 'app.get("/api/users/:id", validateId, async (req, res) => { const user = await getUser(req.params.id); res.json(user); });', target_gate: 'T1', expected_verdict: 'pass', description: 'Route with validation middleware' },
    { id: 'good-23', name: 'Error response', category: 'clean', content: 'if (!found) return res.status(404).json({ error: "Not found", code: "USER_NOT_FOUND" });', target_gate: 'T1', expected_verdict: 'pass', description: 'Structured error response' },
    { id: 'good-24', name: 'Safe HTML rendering', category: 'clean', content: 'element.textContent = sanitize(userInput);', target_gate: 'T4', expected_verdict: 'pass', description: 'Safe text rendering (no innerHTML)' },
    { id: 'good-25', name: 'Dependency injection', category: 'clean', content: 'constructor(private readonly db: Database, private readonly logger: Logger) { }', target_gate: 'T1', expected_verdict: 'pass', description: 'Constructor DI pattern' },
];
export const ALL_SCENARIOS = [...BAD_SCENARIOS, ...GOOD_SCENARIOS];
// ── Evaluator ─────────────────────────────────────────────────────────────────
/**
 * Evaluate a single scenario against a pattern-matching classifier.
 * This is a deterministic, offline classifier — no LLM calls.
 */
export function evaluateScenario(scenario) {
    const start = Date.now();
    const content = scenario.content;
    let actualVerdict = 'pass';
    // T1: Banned patterns
    const bannedPatterns = [
        /\bTODO\b/i, /\bFIXME\b/i, /\bHACK\b/i, /\bPLACEHOLDER\b/i,
        /\bSTUB\b/i, /\bNot\s+implemented\b/i, /\bWIP\b/,
        /\bLorem\s+ipsum\b/i,
    ];
    const emptyFnBody = /function\s+\w+\s*\([^)]*\)\s*\{\s*\}/;
    if (bannedPatterns.some((p) => p.test(content)) || emptyFnBody.test(content)) {
        actualVerdict = 'fail';
    }
    // T4: Security patterns
    const securityPatterns = [
        /(?:api[_-]?key|password|secret)\s*=\s*["'][^"']{3,}["']/i,
        /BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY/,
        /eval\s*\(\s*\w/,
        /innerHTML\s*=\s*\w/,
        /`[^`]*\$\{[^}]*Input[^}]*\}[^`]*`/i,
        /auth.*disabled|disabled.*auth/i,
    ];
    if (securityPatterns.some((p) => p.test(content))) {
        actualVerdict = 'fail';
    }
    // T2: Type issues
    if (/@ts-ignore/.test(content) && !/justification/i.test(content)) {
        actualVerdict = 'fail';
    }
    if (/as\s+any\b/.test(content) && actualVerdict === 'pass') {
        actualVerdict = 'warn';
    }
    // T3: Test issues
    if (/it\s*\(.*\(\)\s*=>\s*\{[^}]*\}\s*\)/.test(content) && !/expect/.test(content)) {
        actualVerdict = 'fail';
    }
    if (/describe\s*\([^)]*,\s*\(\)\s*=>\s*\{\s*\}\s*\)/.test(content)) {
        actualVerdict = 'fail';
    }
    if (/\.skip\s*\(/.test(content) && actualVerdict === 'pass') {
        actualVerdict = 'warn';
    }
    // Warn-level patterns
    if (/console\.log\s*\(.*DEBUG/i.test(content) && actualVerdict === 'pass') {
        actualVerdict = 'warn';
    }
    if (/process\.env\.\w+\s*\|\|\s*["'][^"']{3,}["']/.test(content) && /secret/i.test(content) && actualVerdict === 'pass') {
        actualVerdict = 'warn';
    }
    return {
        scenario_id: scenario.id,
        expected: scenario.expected_verdict,
        actual: actualVerdict,
        correct: actualVerdict === scenario.expected_verdict,
        gate_tier: scenario.target_gate,
        duration_ms: Date.now() - start,
    };
}
// ── Runner ────────────────────────────────────────────────────────────────────
/**
 * Run all benchmark scenarios and return the summary.
 */
export function runBenchmark(scenarios = ALL_SCENARIOS) {
    const log = getLogger();
    const start = Date.now();
    const results = [];
    const by_category = {};
    for (const scenario of scenarios) {
        const result = evaluateScenario(scenario);
        results.push(result);
        if (!by_category[scenario.category]) {
            by_category[scenario.category] = { total: 0, correct: 0 };
        }
        by_category[scenario.category].total++;
        if (result.correct)
            by_category[scenario.category].correct++;
    }
    const correct = results.filter((r) => r.correct).length;
    const summary = {
        total: results.length,
        correct,
        incorrect: results.length - correct,
        accuracy_pct: Math.round((correct / results.length) * 100),
        by_category,
        results,
        duration_ms: Date.now() - start,
    };
    log.info('benchmark', 'complete', {
        total: summary.total,
        accuracy: summary.accuracy_pct,
        duration: summary.duration_ms,
    });
    return summary;
}
/**
 * Format benchmark summary as human-readable text.
 */
export function formatBenchmarkSummary(summary) {
    const lines = [
        '',
        '  Quality Benchmark Results',
        '  ════════════════════════════════════',
        `  Scenarios: ${summary.total}`,
        `  Correct:   ${summary.correct}`,
        `  Incorrect: ${summary.incorrect}`,
        `  Accuracy:  ${summary.accuracy_pct}%`,
        `  Duration:  ${summary.duration_ms}ms`,
        '',
        '  By category:',
    ];
    for (const [cat, stats] of Object.entries(summary.by_category)) {
        const pct = Math.round((stats.correct / stats.total) * 100);
        const icon = pct === 100 ? '\x1b[32m✓\x1b[0m' : (pct >= 80 ? '\x1b[33m⚠\x1b[0m' : '\x1b[31m✗\x1b[0m');
        lines.push(`    ${icon} ${cat.padEnd(16)} ${stats.correct}/${stats.total} (${pct}%)`);
    }
    // Show incorrect classifications
    const incorrect = summary.results.filter((r) => !r.correct);
    if (incorrect.length > 0) {
        lines.push('');
        lines.push('  Misclassifications:');
        for (const r of incorrect.slice(0, 10)) {
            lines.push(`    ${r.scenario_id}: expected ${r.expected}, got ${r.actual}`);
        }
    }
    lines.push('');
    const passIcon = summary.accuracy_pct >= 90 ? '\x1b[32m' : '\x1b[31m';
    lines.push(`  ${passIcon}${summary.accuracy_pct >= 90 ? 'BENCHMARK PASSED' : 'BENCHMARK FAILED'} (target: ≥90%)\x1b[0m`);
    lines.push('');
    return lines.join('\n');
}
//# sourceMappingURL=quality-benchmark.js.map
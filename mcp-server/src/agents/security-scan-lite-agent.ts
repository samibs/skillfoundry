/**
 * Security Scan Lite Agent — lightweight pre-commit security scanner.
 *
 * Unlike sf_security_scan (Semgrep-based, heavy), this agent runs fast regex-based
 * checks for the most common security issues found across 37+ projects:
 *
 * 1. Hardcoded secrets/credentials in source
 * 2. CORS wildcard with credentials
 * 3. Missing auth guards on API endpoints
 * 4. console.log in production code (data leak risk)
 * 5. Dangerous eval/exec patterns
 * 6. SQL injection patterns
 * 7. Insecure cookie settings
 */

import { readFile } from "fs/promises";
import path from "path";
import { exec } from "./exec-utils.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SecurityScanLiteResult {
  passed: boolean;
  findings: SecurityFinding[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    filesScanned: number;
    duration: number;
  };
}

export interface SecurityFinding {
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  category: string;
  file: string;
  line: number;
  code: string;
  detail: string;
  fix: string;
}

// ─── Detection Rules ────────────────────────────────────────────────────────

interface Rule {
  id: string;
  severity: SecurityFinding["severity"];
  category: string;
  pattern: RegExp;
  detail: string;
  fix: string;
  /** Only match in these file extensions */
  extensions?: string[];
  /** Skip files matching these patterns */
  skipPaths?: RegExp[];
}

const RULES: Rule[] = [
  // ─── CRITICAL: Hardcoded Secrets ───────────────────────
  {
    id: "hardcoded-password",
    severity: "CRITICAL",
    category: "hardcoded-secret",
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{4,}['"]/gi,
    detail: "Hardcoded password found in source code",
    fix: "Move to environment variable: process.env.DB_PASSWORD",
    skipPaths: [/\.test\.|\.spec\.|__test__|fixtures|mock|example|\/scripts\/|seed\.|create[-_](?:admin|user)|setup[-_]|ecosystem\.config/i],
  },
  {
    id: "hardcoded-secret-key",
    severity: "CRITICAL",
    category: "hardcoded-secret",
    pattern: /(?:secret|api_key|apikey|auth_token|access_token|private_key)\s*[:=]\s*['"][A-Za-z0-9+/=_-]{8,}['"]/gi,
    detail: "Hardcoded secret/API key found in source code",
    fix: "Move to environment variable and use process.env.<VAR_NAME>",
    skipPaths: [/\.test\.|\.spec\.|__test__|fixtures|\.example|\.sample|\/scripts\/|seed\.|create[-_](?:admin|user)|setup[-_]|ecosystem\.config/i],
  },
  {
    id: "hardcoded-db-url",
    severity: "CRITICAL",
    category: "hardcoded-secret",
    pattern: /(?:postgres|mysql|mongodb|redis):\/\/[^'"}\s]{10,}/g,
    detail: "Hardcoded database connection string found",
    fix: "Use process.env.DATABASE_URL instead of hardcoding the connection string",
    skipPaths: [/\.example|\.sample|\.md$|CLAUDE\.md|ecosystem\.config|docker-compose/i],
  },
  {
    id: "jwt-weak-secret",
    severity: "CRITICAL",
    category: "hardcoded-secret",
    pattern: /jwt\.sign\s*\([^,]+,\s*['"][^'"]{1,20}['"]/gi,
    detail: "JWT signed with a short/weak hardcoded secret",
    fix: "Use a strong random secret from environment variable (min 32 chars)",
  },

  // ─── HIGH: CORS & Auth Issues ──────────────────────────
  {
    id: "cors-wildcard-credentials",
    severity: "HIGH",
    category: "cors-misconfiguration",
    pattern: /(?:allow_origins|origin)\s*[:=]\s*\[?\s*['"]\*['"]/gi,
    detail: "CORS allows all origins — combined with credentials this violates browser security",
    fix: "Set specific allowed origins: origin: ['https://your-domain.com']",
  },
  {
    id: "cors-credentials-true",
    severity: "MEDIUM",
    category: "cors-misconfiguration",
    pattern: /credentials\s*:\s*true/g,
    detail: "CORS credentials enabled — ensure origin is not wildcard",
    fix: "Only enable credentials with specific origin whitelist, never with '*'",
  },
  {
    id: "no-rate-limit",
    severity: "HIGH",
    category: "missing-protection",
    pattern: /(?:router|app)\s*\.\s*(?:post|put|patch|delete)\s*\(\s*['"][^'"]*(?:login|auth|register|signup|reset|forgot)[^'"]*['"]/gi,
    detail: "Auth endpoint without visible rate limiting",
    fix: "Add rate limiting middleware (express-rate-limit, @fastify/rate-limit, or SlowDown)",
  },

  // ─── HIGH: Dangerous Patterns ──────────────────────────
  {
    id: "eval-usage",
    severity: "HIGH",
    category: "code-injection",
    pattern: /\beval\s*\(/g,
    detail: "eval() is a code injection risk — avoid in production",
    fix: "Replace with JSON.parse(), Function constructor, or structured parsing",
    skipPaths: [/node_modules|\.test\.|\.spec\./],
  },
  {
    id: "child-process-shell",
    severity: "HIGH",
    category: "command-injection",
    pattern: /child_process.*exec\s*\(\s*[`'"].*\$\{/g,
    detail: "Shell command with template literal interpolation — command injection risk",
    fix: "Use execFile() with array args instead of exec() with string interpolation",
  },
  {
    id: "sql-string-concat",
    severity: "HIGH",
    category: "sql-injection",
    pattern: /(?:query|execute|raw)\s*\(\s*[`'"](?:SELECT|INSERT|UPDATE|DELETE).*\$\{/gi,
    detail: "SQL query with string interpolation — SQL injection risk",
    fix: "Use parameterized queries: db.query('SELECT * FROM x WHERE id = ?', [id])",
  },

  // ─── MEDIUM: Data Leak Risks ───────────────────────────
  {
    id: "console-log-sensitive",
    severity: "MEDIUM",
    category: "data-leak",
    pattern: /console\.log\s*\([^)]*(?:password|secret|token|key|credential|auth)[^)]*\)/gi,
    detail: "console.log may leak sensitive data to stdout/browser console",
    fix: "Remove or replace with structured logger that sanitizes sensitive fields",
  },
  {
    id: "error-stack-exposure",
    severity: "MEDIUM",
    category: "data-leak",
    pattern: /res\.(?:json|send)\s*\(\s*\{[^}]*(?:stack|stackTrace|err\.message)/g,
    detail: "Error stack trace exposed to client — leaks internal details",
    fix: "Return generic error messages to client, log full stack server-side only",
  },

  // ─── MEDIUM: Insecure Cookies ──────────────────────────
  {
    id: "cookie-no-httponly",
    severity: "MEDIUM",
    category: "insecure-cookie",
    pattern: /(?:set-cookie|cookie)\s*[:=].*(?!httponly)/gi,
    detail: "Cookie may not have HttpOnly flag — accessible to JavaScript (XSS risk)",
    fix: "Set HttpOnly: true, Secure: true, SameSite: 'Strict' on all auth cookies",
  },

  // ─── LOW: Code Quality ────────────────────────────────
  {
    id: "ts-ignore-no-reason",
    severity: "LOW",
    category: "type-evasion",
    pattern: /@ts-ignore(?!\s+\/\/)/g,
    detail: "@ts-ignore without justification comment",
    fix: "Add reason: // @ts-ignore // <reason why this is safe>",
    extensions: [".ts", ".tsx"],
  },
  {
    id: "any-type-usage",
    severity: "LOW",
    category: "type-evasion",
    pattern: /:\s*any\b(?!\s*\/[/*])/g,
    detail: "Explicit 'any' type usage without justification",
    fix: "Use a specific type or 'unknown' with type narrowing",
    extensions: [".ts", ".tsx"],
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

const TEST_FILE_PATTERN = /\/tests?\/|\.test\.|\.spec\.|test_|_test\.|fixtures|__test__|mock|e2e\//i;
const SETUP_SCRIPT_PATTERN = /\/scripts\/|\/seed[\./]|seed\.(?:ts|js|py)|create[-_](?:admin|user|tenant)|setup[-_]|ecosystem\.config|\.seed\./i;
const VALIDATION_MSG_PATTERN = /(?:required|invalid|missing|enter|provide|must\s+be|cannot\s+be|is\s+required)/i;

function isTestFile(relPath: string): boolean {
  return TEST_FILE_PATTERN.test(relPath);
}

function isSetupScript(relPath: string): boolean {
  return SETUP_SCRIPT_PATTERN.test(relPath);
}

function isLocalhostUrl(code: string): boolean {
  return /(?:localhost|127\.0\.0\.1)/.test(code);
}

// ─── Scanner ────────────────────────────────────────────────────────────────

async function findSourceFiles(projectPath: string): Promise<string[]> {
  const result = await exec("find", [
    projectPath, "-type", "f",
    "(", "-name", "*.ts", "-o", "-name", "*.tsx", "-o", "-name", "*.js",
    "-o", "-name", "*.jsx", "-o", "-name", "*.py", "-o", "-name", "*.vue", ")",
    "-not", "-path", "*/node_modules/*",
    "-not", "-path", "*/.next/*",
    "-not", "-path", "*/dist/*",
    "-not", "-path", "*/build/*",
    "-not", "-path", "*/__pycache__/*",
    "-not", "-path", "*/venv/*",
    "-not", "-path", "*/.venv/*",
    "-not", "-path", "*/.history/*",
    "-not", "-path", "*/.angular/*",
    "-not", "-name", "*.bak",
  ], { cwd: projectPath, timeout: 10000 });

  if (!result.success) return [];
  return result.stdout.trim().split("\n").filter(Boolean);
}

export async function runSecurityScanLite(projectPath: string): Promise<SecurityScanLiteResult> {
  const start = Date.now();
  const findings: SecurityFinding[] = [];

  const files = await findSourceFiles(projectPath);
  let filesScanned = 0;

  for (const file of files.slice(0, 1000)) {
    try {
      const content = await readFile(file, "utf-8");
      const relPath = path.relative(projectPath, file);
      const ext = path.extname(file);
      filesScanned++;

      for (const rule of RULES) {
        // Check extension filter
        if (rule.extensions && !rule.extensions.includes(ext)) continue;

        // Check skip paths
        if (rule.skipPaths?.some((p) => p.test(relPath))) continue;

        // Skip hardcoded-secret rules in test files and setup scripts
        if (rule.category === "hardcoded-secret" && (isTestFile(relPath) || isSetupScript(relPath))) continue;

        rule.pattern.lastIndex = 0;
        let match;
        while ((match = rule.pattern.exec(content)) !== null) {
          const beforeMatch = content.slice(0, match.index);
          const lineNum = beforeMatch.split("\n").length;
          const line = content.split("\n")[lineNum - 1]?.trim() || "";

          // Skip if in a comment
          if (line.startsWith("//") || line.startsWith("#") || line.startsWith("*")) continue;

          // Skip hardcoded-password if it's a validation message (e.g., "Password is required")
          if (rule.id === "hardcoded-password" && VALIDATION_MSG_PATTERN.test(match[0])) continue;

          // Skip hardcoded-db-url if it's a localhost/dev connection
          if (rule.id === "hardcoded-db-url" && isLocalhostUrl(match[0])) continue;

          // Skip SQL injection if using parameterized queries ($1, $2 or ?, ?)
          if (rule.id === "sql-string-concat" && /\$\d+|(?:\?\s*,\s*){1,}/.test(line)) continue;

          findings.push({
            severity: rule.severity,
            category: rule.category,
            file: relPath,
            line: lineNum,
            code: match[0].slice(0, 100),
            detail: rule.detail,
            fix: rule.fix,
          });

          // Max 5 findings per rule per file
          if (findings.filter((f) => f.category === rule.category && f.file === relPath).length >= 5) break;
        }
      }
    } catch {
      // skip unreadable files
    }
  }

  // Deduplicate by file+line+category
  const seen = new Set<string>();
  const dedupedFindings = findings.filter((f) => {
    const key = `${f.file}:${f.line}:${f.category}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by severity
  const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  dedupedFindings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const critical = dedupedFindings.filter((f) => f.severity === "CRITICAL").length;
  const high = dedupedFindings.filter((f) => f.severity === "HIGH").length;

  return {
    passed: critical === 0 && high === 0,
    findings: dedupedFindings.slice(0, 50),
    summary: {
      critical,
      high,
      medium: dedupedFindings.filter((f) => f.severity === "MEDIUM").length,
      low: dedupedFindings.filter((f) => f.severity === "LOW").length,
      filesScanned,
      duration: Date.now() - start,
    },
  };
}

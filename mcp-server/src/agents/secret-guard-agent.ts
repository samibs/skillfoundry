/**
 * Secret Guard Agent — pre-commit secret detection and .env validation.
 *
 * Scans project code for hardcoded secrets BEFORE they enter the codebase.
 * Cross-references process.env.* references against .env.example entries.
 *
 * Features:
 *   - Detects API keys, passwords, tokens, database URLs, JWT secrets
 *   - Suggests .env variable names following project conventions
 *   - Validates .env.example completeness
 *   - Low false-positive rate (skips validation messages, localhost, test fixtures)
 */

import { readFile, readdir, access } from "fs/promises";
import path from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SecretFinding {
  filePath: string;
  lineNumber: number;
  ruleId: string;
  severity: "critical" | "high" | "medium";
  description: string;
  matchedContent: string;
  suggestedEnvVar: string | null;
}

export interface EnvValidation {
  referencedVars: string[];
  definedInExample: string[];
  missingFromExample: string[];
  unusedInExample: string[];
}

export interface SecretGuardResult {
  projectPath: string;
  appName: string;
  findings: SecretFinding[];
  envValidation: EnvValidation;
  summary: {
    critical: number;
    high: number;
    medium: number;
    total: number;
    envMissing: number;
  };
}

// ─── Detection Rules ────────────────────────────────────────────────────────

interface SecretRule {
  id: string;
  severity: "critical" | "high" | "medium";
  pattern: RegExp;
  description: string;
  /** If true, skip this match when found in test/setup files */
  skipTests: boolean;
  /** Extract a suggested env var name from the match context */
  suggestEnvVar?: (line: string) => string | null;
}

const SECRET_RULES: SecretRule[] = [
  {
    id: "hardcoded-password",
    severity: "critical",
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"`](?![\s'"`]|process\.env|<%|{{|\$\{)[^'"`]{8,}/i,
    description: "Hardcoded password",
    skipTests: true,
    suggestEnvVar: (line) => {
      const m = line.match(/(\w*password\w*)\s*[:=]/i);
      return m ? m[1].toUpperCase().replace(/([a-z])([A-Z])/g, "$1_$2") : "DB_PASSWORD";
    },
  },
  {
    id: "hardcoded-api-key",
    severity: "critical",
    pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"`](?![\s'"`]|process\.env|<%|{{|\$\{)[A-Za-z0-9_\-]{16,}/i,
    description: "Hardcoded API key",
    skipTests: true,
    suggestEnvVar: () => "API_KEY",
  },
  {
    id: "hardcoded-secret",
    severity: "critical",
    pattern: /(?:secret|SECRET)\s*[:=]\s*['"`](?![\s'"`]|process\.env|<%|{{|\$\{)[A-Za-z0-9_\-+/]{16,}/i,
    description: "Hardcoded secret",
    skipTests: true,
    suggestEnvVar: (line) => {
      const m = line.match(/(\w*secret\w*)\s*[:=]/i);
      return m ? m[1].toUpperCase().replace(/([a-z])([A-Z])/g, "$1_$2") : "APP_SECRET";
    },
  },
  {
    id: "hardcoded-token",
    severity: "critical",
    pattern: /(?:token|TOKEN)\s*[:=]\s*['"`](?![\s'"`]|process\.env|<%|{{|\$\{)[A-Za-z0-9_\-\.]{20,}/i,
    description: "Hardcoded token",
    skipTests: true,
    suggestEnvVar: () => "AUTH_TOKEN",
  },
  {
    id: "hardcoded-db-url",
    severity: "critical",
    pattern: /(?:database[_-]?url|db[_-]?url|connection[_-]?string)\s*[:=]\s*['"`](?:postgres|mysql|mongodb|mssql):\/\/[^'"`]{10,}/i,
    description: "Hardcoded database connection string",
    skipTests: true,
    suggestEnvVar: () => "DATABASE_URL",
  },
  {
    id: "jwt-secret-literal",
    severity: "critical",
    pattern: /(?:jwt[_-]?secret|JWT_SECRET)\s*[:=]\s*['"`](?![\s'"`]|process\.env)[^'"`]{8,}/i,
    description: "Hardcoded JWT secret",
    skipTests: true,
    suggestEnvVar: () => "JWT_SECRET",
  },
  {
    id: "private-key-inline",
    severity: "critical",
    pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
    description: "Private key embedded in source code",
    skipTests: false,
    suggestEnvVar: () => "PRIVATE_KEY_PATH",
  },
  {
    id: "aws-access-key",
    severity: "critical",
    pattern: /(?:AKIA|ASIA)[A-Z0-9]{16}/,
    description: "AWS access key ID",
    skipTests: true,
    suggestEnvVar: () => "AWS_ACCESS_KEY_ID",
  },
  {
    id: "stripe-key",
    severity: "critical",
    pattern: /(?:sk_live_|pk_live_|rk_live_)[A-Za-z0-9]{20,}/,
    description: "Stripe live key",
    skipTests: true,
    suggestEnvVar: () => "STRIPE_SECRET_KEY",
  },
  {
    id: "sendgrid-key",
    severity: "high",
    pattern: /SG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43}/,
    description: "SendGrid API key",
    skipTests: true,
    suggestEnvVar: () => "SENDGRID_API_KEY",
  },
  {
    id: "basic-auth-url",
    severity: "high",
    pattern: /https?:\/\/[^:]+:[^@]+@(?!localhost|127\.0\.0\.1)/i,
    description: "URL with embedded credentials",
    skipTests: true,
    suggestEnvVar: () => "SERVICE_URL",
  },
];

// ─── False Positive Filters ────────────────────────────────────────────────

const VALIDATION_MSG = /(?:required|invalid|missing|enter|provide|must\s+be|cannot\s+be|is\s+required|placeholder|example)/i;
const SETUP_SCRIPT = /\/scripts\/|\/seed[\./]|seed\.(?:ts|js|py)|create[-_](?:admin|user|tenant)|setup[-_]|ecosystem\.config/i;
const LOCALHOST_URL = /(?:localhost|127\.0\.0\.1|0\.0\.0\.0)/;

function isFalsePositive(line: string, filePath: string, rule: SecretRule): boolean {
  // Validation/placeholder messages
  if (VALIDATION_MSG.test(line)) return true;

  // Setup/seed scripts
  if (rule.skipTests && SETUP_SCRIPT.test(filePath)) return true;

  // Localhost URLs for db-url rules
  if (rule.id === "hardcoded-db-url" && LOCALHOST_URL.test(line)) return true;

  // Comments
  const trimmed = line.trim();
  if (trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("*")) return true;

  // .env.example files (these ARE the template)
  if (filePath.includes(".env.example") || filePath.includes(".env.template")) return true;

  // Documentation
  if (filePath.endsWith(".md") || filePath.endsWith(".txt") || filePath.endsWith(".rst")) return true;

  // Already using process.env
  if (/process\.env\./i.test(line)) return true;

  // Environment variable assignment (this IS the .env file)
  if (/^[A-Z_]+=/.test(trimmed) && (filePath.endsWith(".env") || filePath.endsWith(".env.local"))) return true;

  return false;
}

function isTestFile(filePath: string): boolean {
  return /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(filePath) ||
    /test_|_test\./.test(filePath) ||
    filePath.includes("__tests__") ||
    filePath.includes("/test/") ||
    filePath.includes("/tests/");
}

// ─── Scanner ────────────────────────────────────────────────────────────────

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

async function walkSourceFiles(dir: string, maxFiles = 1000): Promise<string[]> {
  const results: string[] = [];
  const skip = new Set(["node_modules", ".git", ".next", "dist", "build", "__pycache__", ".venv"]);
  const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".rb", ".go", ".java", ".cs", ".env", ".yml", ".yaml", ".json"]);

  async function walk(d: string): Promise<void> {
    if (results.length >= maxFiles) return;
    try {
      const entries = await readdir(d, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= maxFiles) return;
        if (skip.has(entry.name) || entry.name.startsWith(".")) continue;
        const fullPath = path.join(d, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (extensions.has(path.extname(entry.name))) {
          results.push(fullPath);
        }
      }
    } catch { /* skip */ }
  }

  await walk(dir);
  return results;
}

// ─── ENV Validation ─────────────────────────────────────────────────────────

async function validateEnv(projectPath: string, files: string[]): Promise<EnvValidation> {
  const referencedVars = new Set<string>();
  const definedInExample = new Set<string>();

  // Scan source files for process.env.* references
  for (const filePath of files) {
    try {
      const content = await readFile(filePath, "utf-8");
      const matches = content.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g);
      for (const m of matches) {
        referencedVars.add(m[1]);
      }
      // Python os.environ / os.getenv
      const pyMatches = content.matchAll(/os\.(?:environ|getenv)\s*\[\s*['"]([A-Z_][A-Z0-9_]*)['"]\s*\]/g);
      for (const m of pyMatches) {
        referencedVars.add(m[1]);
      }
    } catch { /* skip */ }
  }

  // Parse .env.example
  const envExamplePath = path.join(projectPath, ".env.example");
  if (await exists(envExamplePath)) {
    try {
      const content = await readFile(envExamplePath, "utf-8");
      for (const line of content.split("\n")) {
        const match = line.match(/^([A-Z_][A-Z0-9_]*)=/);
        if (match) definedInExample.add(match[1]);
      }
    } catch { /* skip */ }
  }

  const refArray = Array.from(referencedVars).sort();
  const defArray = Array.from(definedInExample).sort();
  const missing = refArray.filter(v => !definedInExample.has(v));
  const unused = defArray.filter(v => !referencedVars.has(v));

  // Filter out common system env vars from missing
  const systemVars = new Set(["NODE_ENV", "PORT", "HOME", "USER", "PATH", "PWD", "SHELL", "CI", "VERCEL", "NEXT_PUBLIC_VERCEL_URL"]);
  const filteredMissing = missing.filter(v => !systemVars.has(v));

  return {
    referencedVars: refArray,
    definedInExample: defArray,
    missingFromExample: filteredMissing,
    unusedInExample: unused,
  };
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * Scan a project for hardcoded secrets and validate .env completeness.
 */
export async function guardSecrets(projectPath: string): Promise<SecretGuardResult> {
  const appName = path.basename(projectPath);
  const files = await walkSourceFiles(projectPath);
  const findings: SecretFinding[] = [];

  for (const filePath of files) {
    const relPath = path.relative(projectPath, filePath);
    const isTest = isTestFile(relPath);

    try {
      const content = await readFile(filePath, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        for (const rule of SECRET_RULES) {
          // Skip test files for rules that allow it
          if (rule.skipTests && isTest) continue;

          rule.pattern.lastIndex = 0;
          if (!rule.pattern.test(line)) continue;
          if (isFalsePositive(line, relPath, rule)) continue;

          findings.push({
            filePath: relPath,
            lineNumber: i + 1,
            ruleId: rule.id,
            severity: rule.severity,
            description: rule.description,
            matchedContent: line.trim().slice(0, 100),
            suggestedEnvVar: rule.suggestEnvVar ? rule.suggestEnvVar(line) : null,
          });

          // One finding per rule per file
          break;
        }
      }
    } catch { /* skip */ }
  }

  // ENV validation
  const envValidation = await validateEnv(projectPath, files);

  // Summary
  const summary = {
    critical: findings.filter(f => f.severity === "critical").length,
    high: findings.filter(f => f.severity === "high").length,
    medium: findings.filter(f => f.severity === "medium").length,
    total: findings.length,
    envMissing: envValidation.missingFromExample.length,
  };

  return {
    projectPath,
    appName,
    findings,
    envValidation,
    summary,
  };
}

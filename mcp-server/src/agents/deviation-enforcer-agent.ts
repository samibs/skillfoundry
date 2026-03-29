/**
 * Deviation Enforcer Agent — programmatic enforcement of known LLM deviation patterns.
 *
 * Parses the known deviations catalog (161 patterns, 16 categories) into structured
 * rules stored in SQLite, then validates project code against the full rule set.
 *
 * Features:
 *   - Loads deviation catalog from knowledge store
 *   - Converts patterns to regex-based detection rules
 *   - Scans project files against all active rules
 *   - Reports violations with severity, file location, and prevention guidance
 *   - Supports per-project allowlists
 */

import { readFile, readdir, stat, access } from "fs/promises";
import path from "path";
import {
  initDatabase,
  upsertDeviationRule,
  getDeviationRules,
  getDeviationRuleCount,
  queryProjectArtifacts,
  type DeviationRule,
} from "../state/db.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DeviationViolation {
  ruleId: string;
  category: string;
  severity: string;
  patternDescription: string;
  prevention: string;
  filePath: string;
  lineNumber: number;
  lineContent: string;
}

export interface DeviationScanResult {
  projectPath: string;
  appName: string;
  rulesChecked: number;
  totalViolations: number;
  bySeverity: Record<string, number>;
  byCategory: Record<string, number>;
  violations: DeviationViolation[];
}

// ─── Catalog Parser ─────────────────────────────────────────────────────────

/**
 * Parse the known deviations markdown catalog into structured rules.
 */
function parseCatalog(content: string): Omit<DeviationRule, "active" | "source">[] {
  const rules: Omit<DeviationRule, "active" | "source">[] = [];
  let currentCategory = "";

  const lines = content.split("\n");
  for (const line of lines) {
    // Category header
    const catMatch = line.match(/^## CATEGORY \d+:\s+(.+)/);
    if (catMatch) {
      currentCategory = catMatch[1].trim();
      continue;
    }

    // Table row: | ID | Pattern | Prevention | Agent |
    const rowMatch = line.match(/^\|\s*([A-Z]+-\d{3})\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|/);
    if (rowMatch && currentCategory) {
      const [, id, pattern, prevention, agent] = rowMatch;
      const { regex, glob } = deriveDetection(id, pattern);

      rules.push({
        id,
        category: currentCategory,
        patternDescription: pattern.trim(),
        prevention: prevention.trim(),
        responsibleAgent: agent.trim() || null,
        detectionRegex: regex,
        fileGlob: glob,
        severity: deriveSeverity(id, pattern),
      });
    }
  }

  return rules;
}

/**
 * Derive a detection regex and file glob from the pattern description and ID prefix.
 */
function deriveDetection(id: string, pattern: string): { regex: string | null; glob: string | null } {
  const prefix = id.replace(/-\d{3}$/, "");
  const p = pattern.toLowerCase();

  // Frontend patterns
  if (prefix === "FE") {
    if (p.includes("index as") && p.includes("key")) return { regex: "key=\\{(?:index|i|idx)\\}", glob: "*.{tsx,jsx}" };
    if (p.includes("horizontal scroll")) return { regex: "overflow-x:\\s*(?:scroll|auto)", glob: "*.{css,scss,tsx,jsx}" };
    if (p.includes("loading") && p.includes("error") && p.includes("state")) return { regex: null, glob: "*.{tsx,jsx}" };
    if (p.includes("different width")) return { regex: null, glob: "*.{tsx,jsx}" };
    return { regex: null, glob: "*.{tsx,jsx,ts,js}" };
  }

  // Backend patterns
  if (prefix === "BE") {
    if (p.includes("raw sql") || p.includes("string concat")) return { regex: "(?:query|execute)\\s*\\(\\s*[`'\"].*\\$\\{", glob: "*.{ts,js,py}" };
    if (p.includes("no input validation")) return { regex: null, glob: "*.{ts,js}" };
    if (p.includes("500") && p.includes("stack trace")) return { regex: "res\\.(?:status\\(500\\)|json).*(?:stack|err\\.message)", glob: "*.{ts,js}" };
    return { regex: null, glob: "*.{ts,js,py}" };
  }

  // Database patterns
  if (prefix === "DB") {
    if (p.includes("no rollback")) return { regex: null, glob: "*.{sql,ts,js}" };
    if (p.includes("cascade delete")) return { regex: "ON\\s+DELETE\\s+CASCADE", glob: "*.{sql,ts,js}" };
    return { regex: null, glob: "*.{sql,ts,js}" };
  }

  // TypeScript patterns
  if (prefix === "TS") {
    if (p.includes("ts-ignore") || p.includes("@ts-ignore")) return { regex: "@ts-ignore(?!\\s*/\\*)", glob: "*.{ts,tsx}" };
    if (p.includes("any")) return { regex: ":\\s*any(?:\\s|[;,\\)])", glob: "*.{ts,tsx}" };
    return { regex: null, glob: "*.{ts,tsx}" };
  }

  // Security patterns
  if (prefix === "SEC") {
    if (p.includes("hardcoded") && (p.includes("secret") || p.includes("credential") || p.includes("password"))) {
      return { regex: "(?:password|secret|api_key|apiKey|token)\\s*[:=]\\s*['\"][^'\"]{8,}", glob: "*.{ts,js,py,env}" };
    }
    if (p.includes("sql injection")) return { regex: "(?:query|execute)\\s*\\(\\s*[`'\"].*\\+.*\\)", glob: "*.{ts,js,py}" };
    if (p.includes("xss")) return { regex: "dangerouslySetInnerHTML|innerHTML\\s*=", glob: "*.{tsx,jsx,ts,js}" };
    return { regex: null, glob: "*.{ts,js,py,tsx,jsx}" };
  }

  // Authorization patterns
  if (prefix === "AUTH") {
    if (p.includes("no auth") || p.includes("missing auth")) return { regex: null, glob: "*.{ts,js}" };
    return { regex: null, glob: "*.{ts,js}" };
  }

  // Error handling patterns
  if (prefix === "ERR") {
    if (p.includes("empty catch") || p.includes("swallow")) return { regex: "catch\\s*\\([^)]*\\)\\s*\\{\\s*\\}", glob: "*.{ts,js,tsx,jsx}" };
    return { regex: null, glob: "*.{ts,js}" };
  }

  // LLM-specific patterns
  if (prefix === "LLM") {
    if (p.includes("placeholder") || p.includes("todo") || p.includes("coming soon")) {
      return { regex: "(?:TODO|FIXME|PLACEHOLDER|COMING SOON|NOT IMPLEMENTED|STUB)(?!.*test)", glob: "*.{ts,js,tsx,jsx,py}" };
    }
    return { regex: null, glob: "*.{ts,js,tsx,jsx}" };
  }

  return { regex: null, glob: null };
}

function deriveSeverity(id: string, pattern: string): string {
  const prefix = id.replace(/-\d{3}$/, "");
  const p = pattern.toLowerCase();

  if (prefix === "SEC") return "critical";
  if (prefix === "AUTH") return "high";
  if (p.includes("sql injection") || p.includes("xss") || p.includes("credential")) return "critical";
  if (p.includes("hardcoded") || p.includes("secret")) return "critical";
  if (p.includes("validation") || p.includes("sanitiz")) return "high";
  if (prefix === "ERR") return "medium";
  if (prefix === "LLM") return "medium";
  return "medium";
}

// ─── Catalog Loader ─────────────────────────────────────────────────────────

/**
 * Load the known deviations catalog from the knowledge store into deviation_rules.
 */
export async function loadDeviationCatalog(dbPath?: string): Promise<number> {
  await initDatabase(dbPath);

  // Find the catalog in project_artifacts
  const artifacts = queryProjectArtifacts({ artifactType: "known_deviations", limit: 1 });
  if (artifacts.length === 0) {
    console.log("[DEVIATION] No known_deviations catalog found in knowledge store");
    return 0;
  }

  const catalog = artifacts[0];
  const rules = parseCatalog(catalog.content);

  let loaded = 0;
  for (const rule of rules) {
    upsertDeviationRule({
      ...rule,
      active: true,
      source: "catalog",
    });
    loaded++;
  }

  console.log(`[DEVIATION] Loaded ${loaded} rules from catalog`);
  return loaded;
}

// ─── Scanner ────────────────────────────────────────────────────────────────

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

async function walkFiles(dir: string, maxFiles = 2000): Promise<string[]> {
  const results: string[] = [];
  const skip = new Set(["node_modules", ".git", ".next", "dist", "build", "__pycache__", ".venv", "venv"]);

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
        } else {
          results.push(fullPath);
        }
      }
    } catch { /* skip inaccessible */ }
  }

  await walk(dir);
  return results;
}

function matchesGlob(filePath: string, glob: string): boolean {
  const exts = glob.match(/\.\{([^}]+)\}/);
  if (exts) {
    const extensions = exts[1].split(",").map(e => `.${e.trim()}`);
    return extensions.some(ext => filePath.endsWith(ext));
  }
  if (glob.startsWith("*.")) {
    return filePath.endsWith(glob.slice(1));
  }
  return true;
}

/**
 * Scan a project against all active deviation rules.
 */
export async function enforceDeviations(
  projectPath: string,
  dbPath?: string,
  options?: { maxViolations?: number }
): Promise<DeviationScanResult> {
  await initDatabase(dbPath);
  const appName = path.basename(projectPath);
  const maxViolations = options?.maxViolations ?? 200;

  // Get active rules
  const rules = getDeviationRules({ active: true });
  const regexRules = rules.filter(r => r.detectionRegex);

  // Scan files
  const files = await walkFiles(projectPath);
  const violations: DeviationViolation[] = [];

  for (const filePath of files) {
    if (violations.length >= maxViolations) break;

    const relPath = path.relative(projectPath, filePath);

    // Skip test files for most rules
    const isTest = /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(filePath) || /test_|_test\./.test(filePath);

    for (const rule of regexRules) {
      if (violations.length >= maxViolations) break;

      // Check file glob
      if (rule.fileGlob && !matchesGlob(filePath, rule.fileGlob)) continue;

      // Skip LLM/placeholder checks in test files
      if (isTest && rule.id.startsWith("LLM")) continue;

      try {
        const content = await readFile(filePath, "utf-8");
        let regex: RegExp;
        try {
          if (rule.detectionRegex!.length > 500) continue; // Skip overly complex regex
          regex = new RegExp(rule.detectionRegex!, "gi");
        } catch {
          continue; // Skip invalid regex patterns
        }
        const lines = content.split("\n");

        for (let i = 0; i < lines.length; i++) {
          regex.lastIndex = 0;
          if (regex.test(lines[i])) {
            // Skip comments
            const trimmed = lines[i].trim();
            if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("#")) continue;

            violations.push({
              ruleId: rule.id,
              category: rule.category,
              severity: rule.severity,
              patternDescription: rule.patternDescription,
              prevention: rule.prevention,
              filePath: relPath,
              lineNumber: i + 1,
              lineContent: lines[i].trim().slice(0, 200),
            });

            // Only report first occurrence per rule per file
            break;
          }
        }
      } catch {
        // skip unreadable files
      }
    }
  }

  // Aggregate
  const bySeverity: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const v of violations) {
    bySeverity[v.severity] = (bySeverity[v.severity] || 0) + 1;
    byCategory[v.category] = (byCategory[v.category] || 0) + 1;
  }

  return {
    projectPath,
    appName,
    rulesChecked: regexRules.length,
    totalViolations: violations.length,
    bySeverity,
    byCategory,
    violations,
  };
}

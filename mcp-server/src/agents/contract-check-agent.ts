/**
 * Contract Check Agent — validates frontend API calls match actual backend endpoints.
 *
 * The #1 vibe-coding failure: LLM builds frontend and backend that don't agree
 * on endpoint paths, HTTP methods, request body schemas, or response shapes.
 *
 * This agent scans frontend source files for API calls (fetch, axios, etc.),
 * then checks if corresponding backend routes exist with matching shapes.
 */

import { readFile, readdir } from "fs/promises";
import path from "path";
import { exec } from "./exec-utils.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ContractCheckResult {
  passed: boolean;
  frontendCalls: ApiCall[];
  backendRoutes: BackendRoute[];
  mismatches: ContractMismatch[];
  orphanedCalls: ApiCall[];
  summary: {
    totalFrontendCalls: number;
    totalBackendRoutes: number;
    matchedCount: number;
    mismatchCount: number;
    orphanedCount: number;
  };
  duration: number;
}

export interface ApiCall {
  file: string;
  line: number;
  method: string;
  path: string;
  raw: string;
}

export interface BackendRoute {
  file: string;
  line: number;
  method: string;
  path: string;
  raw: string;
}

export interface ContractMismatch {
  type: "method_mismatch" | "path_not_found" | "suspicious_path";
  frontendCall: ApiCall;
  closestRoute?: BackendRoute;
  detail: string;
}

// ─── Frontend API Call Extraction ────────────────────────────────────────────

const FETCH_PATTERNS = [
  // fetch("/api/...", { method: "POST" })
  /fetch\s*\(\s*[`'"](\/api\/[^`'"]*)[`'"]\s*(?:,\s*\{[^}]*method\s*:\s*[`'"](\w+)[`'"][^}]*\})?/g,
  // axios.get("/api/..."), axios.post("/api/...")
  /axios\s*\.\s*(get|post|put|patch|delete)\s*\(\s*[`'"](\/api\/[^`'"]*)[`'"]/gi,
  // api.get("/api/..."), client.post("/api/...")
  /(?:api|client|http)\s*\.\s*(get|post|put|patch|delete)\s*\(\s*[`'"](\/api\/[^`'"]*)[`'"]/gi,
  // $fetch("/api/...") (Nuxt)
  /\$fetch\s*\(\s*[`'"](\/api\/[^`'"]*)[`'"]\s*(?:,\s*\{[^}]*method\s*:\s*[`'"](\w+)[`'"][^}]*\})?/g,
];

const TEMPLATE_LITERAL_API = /fetch\s*\(\s*`(\/api\/[^`]*)`/g;

async function extractFrontendCalls(projectPath: string): Promise<ApiCall[]> {
  const calls: ApiCall[] = [];

  // Find frontend source files
  const result = await exec("find", [
    projectPath, "-type", "f",
    "(", "-name", "*.ts", "-o", "-name", "*.tsx", "-o", "-name", "*.js", "-o", "-name", "*.jsx", "-o", "-name", "*.vue", "-o", "-name", "*.svelte", ")",
    "-not", "-path", "*/node_modules/*",
    "-not", "-path", "*/.next/*",
    "-not", "-path", "*/dist/*",
    "-not", "-path", "*/build/*",
  ], { cwd: projectPath, timeout: 10000 });

  if (!result.success) return calls;

  const files = result.stdout.trim().split("\n").filter(Boolean);

  // Heuristic: only scan files likely to be frontend
  const frontendFiles = files.filter((f) => {
    const rel = path.relative(projectPath, f);
    return (
      rel.startsWith("src/") ||
      rel.startsWith("app/") ||
      rel.startsWith("pages/") ||
      rel.startsWith("components/") ||
      rel.startsWith("lib/") ||
      rel.startsWith("utils/") ||
      rel.startsWith("hooks/") ||
      rel.startsWith("services/") ||
      rel.startsWith("frontend/") ||
      rel.startsWith("client/")
    );
  });

  for (const file of frontendFiles.slice(0, 200)) {
    try {
      const content = await readFile(file, "utf-8");
      const lines = content.split("\n");

      for (const pattern of FETCH_PATTERNS) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const beforeMatch = content.slice(0, match.index);
          const lineNum = beforeMatch.split("\n").length;

          let apiPath: string;
          let method: string;

          if (match[0].startsWith("axios") || match[0].match(/^(?:api|client|http)\./)) {
            method = match[1].toUpperCase();
            apiPath = match[2];
          } else {
            apiPath = match[1];
            method = match[2]?.toUpperCase() || "GET";
          }

          // Normalize template literals: /api/users/${id} -> /api/users/:id
          apiPath = apiPath.replace(/\$\{[^}]+\}/g, ":param");

          calls.push({
            file: path.relative(projectPath, file),
            line: lineNum,
            method,
            path: apiPath,
            raw: match[0].slice(0, 120),
          });
        }
      }

      // Also catch template literal paths
      TEMPLATE_LITERAL_API.lastIndex = 0;
      let tlMatch;
      while ((tlMatch = TEMPLATE_LITERAL_API.exec(content)) !== null) {
        const beforeMatch = content.slice(0, tlMatch.index);
        const lineNum = beforeMatch.split("\n").length;
        const apiPath = tlMatch[1].replace(/\$\{[^}]+\}/g, ":param");

        // Skip if already captured by the regular fetch pattern
        if (!calls.some((c) => c.file === path.relative(projectPath, file) && c.line === lineNum)) {
          calls.push({
            file: path.relative(projectPath, file),
            line: lineNum,
            method: "GET",
            path: apiPath,
            raw: tlMatch[0].slice(0, 120),
          });
        }
      }
    } catch {
      // skip unreadable files
    }
  }

  // Deduplicate by file+path+method
  const seen = new Set<string>();
  return calls.filter((c) => {
    const key = `${c.file}:${c.method}:${c.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Backend Route Extraction ───────────────────────────────────────────────

const ROUTE_PATTERNS = [
  // Express: router.get("/api/...", handler)
  /(?:router|app)\s*\.\s*(get|post|put|patch|delete)\s*\(\s*[`'"](\/api\/[^`'"]*)[`'"]/gi,
  // Next.js App Router: export async function GET/POST/PUT/DELETE
  /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/gi,
  // Fastify: fastify.get("/api/...", handler)
  /fastify\s*\.\s*(get|post|put|patch|delete)\s*\(\s*[`'"](\/api\/[^`'"]*)[`'"]/gi,
  // Python FastAPI: @app.get("/api/...")
  /@(?:app|router)\s*\.\s*(get|post|put|patch|delete)\s*\(\s*[`'"](\/api\/[^`'"]*)[`'"]/gi,
];

async function extractBackendRoutes(projectPath: string): Promise<BackendRoute[]> {
  const routes: BackendRoute[] = [];

  const result = await exec("find", [
    projectPath, "-type", "f",
    "(", "-name", "*.ts", "-o", "-name", "*.tsx", "-o", "-name", "*.js", "-o", "-name", "*.py", ")",
    "-not", "-path", "*/node_modules/*",
    "-not", "-path", "*/.next/*",
    "-not", "-path", "*/dist/*",
  ], { cwd: projectPath, timeout: 10000 });

  if (!result.success) return routes;

  const files = result.stdout.trim().split("\n").filter(Boolean);

  // Backend files heuristic
  const backendFiles = files.filter((f) => {
    const rel = path.relative(projectPath, f);
    return (
      rel.startsWith("api/") ||
      rel.startsWith("src/api/") ||
      rel.startsWith("src/app/api/") ||
      rel.startsWith("app/api/") ||
      rel.startsWith("pages/api/") ||
      rel.startsWith("server/") ||
      rel.startsWith("backend/") ||
      rel.startsWith("routes/") ||
      rel.startsWith("src/routes/") ||
      rel.includes("route.ts") ||
      rel.includes("route.js")
    );
  });

  for (const file of backendFiles.slice(0, 200)) {
    try {
      const content = await readFile(file, "utf-8");
      const rel = path.relative(projectPath, file);

      // Check for Next.js App Router pattern (file-based routing)
      if (rel.includes("/api/") && (rel.endsWith("route.ts") || rel.endsWith("route.js"))) {
        // Extract path from directory structure: src/app/api/users/[id]/route.ts -> /api/users/:id
        const apiMatch = rel.match(/(?:app|pages)\/(api\/.*?)\/route\.[tj]s$/);
        if (apiMatch) {
          const routePath = "/" + apiMatch[1].replace(/\[([^\]]+)\]/g, ":$1");

          // Find exported HTTP methods
          const methodPattern = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/g;
          let methodMatch;
          while ((methodMatch = methodPattern.exec(content)) !== null) {
            const beforeMatch = content.slice(0, methodMatch.index);
            const lineNum = beforeMatch.split("\n").length;
            routes.push({
              file: rel,
              line: lineNum,
              method: methodMatch[1].toUpperCase(),
              path: routePath,
              raw: methodMatch[0],
            });
          }
        }
        continue;
      }

      // Check Express/Fastify/Python patterns
      for (const pattern of ROUTE_PATTERNS) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(content)) !== null) {
          if (!match[2]) continue; // Skip Next.js export patterns here
          const beforeMatch = content.slice(0, match.index);
          const lineNum = beforeMatch.split("\n").length;
          const routePath = match[2].replace(/\{([^}]+)\}/g, ":$1"); // Python {id} -> :id

          routes.push({
            file: rel,
            line: lineNum,
            method: match[1].toUpperCase(),
            path: routePath,
            raw: match[0].slice(0, 120),
          });
        }
      }
    } catch {
      // skip unreadable files
    }
  }

  const seen = new Set<string>();
  return routes.filter((r) => {
    const key = `${r.method}:${r.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Contract Matching ──────────────────────────────────────────────────────

function normalizePath(p: string): string {
  return p.replace(/:[\w]+/g, ":param").replace(/\/+$/, "").toLowerCase();
}

function findMismatches(calls: ApiCall[], routes: BackendRoute[]): {
  mismatches: ContractMismatch[];
  orphaned: ApiCall[];
  matchedCount: number;
} {
  const mismatches: ContractMismatch[] = [];
  const orphaned: ApiCall[] = [];
  let matchedCount = 0;

  const routeMap = new Map<string, BackendRoute[]>();
  for (const route of routes) {
    const norm = normalizePath(route.path);
    const existing = routeMap.get(norm) || [];
    existing.push(route);
    routeMap.set(norm, existing);
  }

  for (const call of calls) {
    const normCall = normalizePath(call.path);
    const matchingRoutes = routeMap.get(normCall);

    if (!matchingRoutes || matchingRoutes.length === 0) {
      // Find closest route for helpful error message
      let closest: BackendRoute | undefined;
      let bestScore = 0;
      for (const route of routes) {
        const score = pathSimilarity(normCall, normalizePath(route.path));
        if (score > bestScore) {
          bestScore = score;
          closest = route;
        }
      }

      if (closest && bestScore > 0.5) {
        mismatches.push({
          type: "path_not_found",
          frontendCall: call,
          closestRoute: closest,
          detail: `Frontend calls ${call.method} ${call.path} but no matching backend route exists. Closest: ${closest.method} ${closest.path} (${closest.file}:${closest.line})`,
        });
      } else {
        orphaned.push(call);
      }
      continue;
    }

    // Path exists — check method match
    const methodMatch = matchingRoutes.find((r) => r.method === call.method);
    if (methodMatch) {
      matchedCount++;
    } else {
      mismatches.push({
        type: "method_mismatch",
        frontendCall: call,
        closestRoute: matchingRoutes[0],
        detail: `Frontend calls ${call.method} ${call.path} but backend only defines ${matchingRoutes.map((r) => r.method).join(", ")} for this path`,
      });
    }
  }

  return { mismatches, orphaned, matchedCount };
}

function pathSimilarity(a: string, b: string): number {
  const partsA = a.split("/").filter(Boolean);
  const partsB = b.split("/").filter(Boolean);
  if (partsA.length === 0 || partsB.length === 0) return 0;

  let matches = 0;
  const minLen = Math.min(partsA.length, partsB.length);
  for (let i = 0; i < minLen; i++) {
    if (partsA[i] === partsB[i] || partsA[i] === ":param" || partsB[i] === ":param") {
      matches++;
    }
  }

  return matches / Math.max(partsA.length, partsB.length);
}

// ─── Main ───────────────────────────────────────────────────────────────────

export async function checkContracts(projectPath: string): Promise<ContractCheckResult> {
  const start = Date.now();

  const [frontendCalls, backendRoutes] = await Promise.all([
    extractFrontendCalls(projectPath),
    extractBackendRoutes(projectPath),
  ]);

  const { mismatches, orphaned, matchedCount } = findMismatches(frontendCalls, backendRoutes);

  return {
    passed: mismatches.length === 0 && orphaned.length === 0,
    frontendCalls,
    backendRoutes,
    mismatches,
    orphanedCalls: orphaned,
    summary: {
      totalFrontendCalls: frontendCalls.length,
      totalBackendRoutes: backendRoutes.length,
      matchedCount,
      mismatchCount: mismatches.length,
      orphanedCount: orphaned.length,
    },
    duration: Date.now() - start,
  };
}

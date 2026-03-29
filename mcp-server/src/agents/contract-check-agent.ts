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
  // fetch with template literal: fetch(`/api/users/${id}`)
  /fetch\s*\(\s*`(\/api\/[^`]*)`\s*(?:,\s*\{[^}]*method\s*:\s*[`'"](\w+)[`'"][^}]*\})?/g,
  // fetch with hardcoded domain: fetch("http://localhost:5004/auth/login")
  /fetch\s*\(\s*['"]https?:\/\/[^'"]*?(\/[^'"]+)['"]\s*(?:,\s*\{[^}]*method\s*:\s*[`'"](\w+)[`'"][^}]*\})?/g,
  // fetch with template literal domain: fetch(`${API_URL}/path`)
  /fetch\s*\(\s*`\$\{[^}]+\}(\/[^`]+)`\s*(?:,\s*\{[^}]*method\s*:\s*[`'"](\w+)[`'"][^}]*\})?/g,
  // axios.get("/api/..."), axios.post("/api/...")
  /axios\s*\.\s*(get|post|put|patch|delete)\s*\(\s*[`'"](\/[^`'"]*)[`'"]/gi,
  // axios with template literal: axios.post(`/api/users/${id}`)
  /axios\s*\.\s*(get|post|put|patch|delete)\s*\(\s*`(\/[^`]*)`/gi,
  // axios with domain template: axios.post(`${BASE_URL}/path`)
  /axios\s*\.\s*(get|post|put|patch|delete)\s*\(\s*`\$\{[^}]+\}(\/[^`]*)`/gi,
  // Centralized API clients: api.get("/path"), client.post("/users"), apiClient.delete("/items/:id")
  /(?:api|client|apiClient|http|axiosInstance|instance|request)\s*\.\s*(get|post|put|patch|delete)\s*(?:<[^>]*>)?\s*\(\s*['"`](\/[^'"`]*)[`'"]/gi,
  // Centralized API client with template literal
  /(?:api|client|apiClient|http|axiosInstance|instance|request)\s*\.\s*(get|post|put|patch|delete)\s*(?:<[^>]*>)?\s*\(\s*`(\/[^`]*)`/gi,
  // $fetch("/api/...") (Nuxt)
  /\$fetch\s*\(\s*[`'"](\/api\/[^`'"]*)[`'"]\s*(?:,\s*\{[^}]*method\s*:\s*[`'"](\w+)[`'"][^}]*\})?/g,
  // useFetch (Nuxt/custom hooks)
  /useFetch\s*\(\s*[`'"](\/api\/[^`'"]*)[`'"]\s*(?:,\s*\{[^}]*method\s*:\s*[`'"](\w+)[`'"][^}]*\})?/g,
  // Angular HttpClient: this.http.get<T>("/path"), this.http.post("/path")
  /this\.http\s*\.\s*(get|post|put|patch|delete)\s*(?:<[^>]*>)?\s*\(\s*[`'"](\/[^`'"]*)[`'"]/gi,
  // Angular HttpClient with template literal
  /this\.http\s*\.\s*(get|post|put|patch|delete)\s*(?:<[^>]*>)?\s*\(\s*`(\/[^`]*)`/gi,
  // Angular HttpClient with baseUrl template: `${this.baseUrl}/path`
  /this\.http\s*\.\s*(get|post|put|patch|delete)\s*(?:<[^>]*>)?\s*\(\s*`\$\{[^}]+\}(\/[^`]*)`/gi,
];

const TEMPLATE_LITERAL_API = /fetch\s*\(\s*`(\/[^`]*)`/g;

// Angular baseUrl resolution: find `baseUrl = '/api/v1/...'` and use it to resolve paths
const ANGULAR_BASE_URL_PATTERN = /(?:baseUrl|apiUrl|BASE_URL)\s*=\s*[`'"](\/[^`'"]*)[`'"]/g;

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
    "-not", "-path", "*/.history/*",
    "-not", "-path", "*/.angular/*",
    "-not", "-path", "*/__pycache__/*",
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
      rel.startsWith("store/") ||
      rel.startsWith("stores/") ||
      rel.startsWith("api/") ||
      rel.startsWith("frontend/") ||
      rel.startsWith("client/") ||
      rel.startsWith("web/") ||
      // Monorepo support: match nested frontend/src patterns
      rel.includes("/frontend/") ||
      rel.includes("/client/") ||
      rel.includes("/web/") ||
      rel.includes("/src/app/") ||
      rel.includes("/src/services/") ||
      rel.includes("/src/store/") ||
      rel.includes("/src/stores/") ||
      rel.includes("/src/hooks/") ||
      rel.includes("/src/api/")
    );
  });

  for (const file of frontendFiles.slice(0, 500)) {
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

          if (match[0].startsWith("axios") ||
              match[0].match(/^(?:api|client|apiClient|http|axiosInstance|instance|request)\./) ||
              match[0].startsWith("this.http")) {
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
      // Angular baseUrl resolution: find baseUrl and resolve this.http calls using it
      ANGULAR_BASE_URL_PATTERN.lastIndex = 0;
      const baseUrlMatch = ANGULAR_BASE_URL_PATTERN.exec(content);
      if (baseUrlMatch) {
        const baseUrl = baseUrlMatch[1];
        // Find this.http.method(this.baseUrl...) or this.http.method(`${this.baseUrl}...`)
        const baseUrlCallPattern = /this\.http\s*\.\s*(get|post|put|patch|delete)\s*(?:<[^>]*>)?\s*\(\s*(?:this\.(?:baseUrl|apiUrl)|`\$\{this\.(?:baseUrl|apiUrl)\}([^`]*)`)(?:\s*[,)])/gi;
        baseUrlCallPattern.lastIndex = 0;
        let buMatch;
        while ((buMatch = baseUrlCallPattern.exec(content)) !== null) {
          const beforeMatch = content.slice(0, buMatch.index);
          const lineNum = beforeMatch.split("\n").length;
          const method = buMatch[1].toUpperCase();
          const suffix = buMatch[2] || "";
          const resolvedPath = baseUrl + suffix.replace(/\$\{[^}]+\}/g, ":param");
          const relFile = path.relative(projectPath, file);

          if (!calls.some((c) => c.file === relFile && c.line === lineNum)) {
            calls.push({
              file: relFile,
              line: lineNum,
              method,
              path: resolvedPath,
              raw: buMatch[0].slice(0, 120),
            });
          }
        }
      }
      // ─── Centralized API Client baseURL Resolution ─────────────
      // const api = axios.create({ baseURL: '/api/v1' })  →  api.get('/users') = /api/v1/users
      const baseUrlPatterns = [
        /(?:axios\.create|createApiClient|createClient)\s*\(\s*\{[^}]*baseURL\s*:\s*['"`](\/[^'"`]*)['"`]/g,
        /(?:const|let|var)\s+\w+\s*=\s*['"`](\/api\/[^'"`]*)['"`]/g,
      ];

      const baseUrls: string[] = [];
      for (const bup of baseUrlPatterns) {
        bup.lastIndex = 0;
        let buMatch;
        while ((buMatch = bup.exec(content)) !== null) {
          baseUrls.push(buMatch[1].replace(/\/+$/, ""));
        }
      }

      if (baseUrls.length > 0) {
        // Find API calls using variable names that reference these clients
        const clientCallPattern = /(\w+)\s*\.\s*(get|post|put|patch|delete)\s*(?:<[^>]*>)?\s*\(\s*['"`]((?!\/api\/)[^'"`]*)['"`]/gi;
        clientCallPattern.lastIndex = 0;
        let ccMatch;
        while ((ccMatch = clientCallPattern.exec(content)) !== null) {
          const callPath = ccMatch[3];
          // Only resolve if the path doesn't already start with /api
          if (callPath.startsWith("/") && !callPath.startsWith("/api")) {
            const beforeMatch = content.slice(0, ccMatch.index);
            const lineNum = beforeMatch.split("\n").length;
            const resolvedPath = baseUrls[0] + callPath.replace(/\$\{[^}]+\}/g, ":param");
            const relFile = path.relative(projectPath, file);

            if (!calls.some((c) => c.file === relFile && c.line === lineNum)) {
              calls.push({
                file: relFile,
                line: lineNum,
                method: ccMatch[2].toUpperCase(),
                path: resolvedPath,
                raw: ccMatch[0].slice(0, 120),
              });
            }
          }
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
  // Express: router.get("/api/...", handler) or router.get("/path", handler)
  /(?:router|app)\s*\.\s*(get|post|put|patch|delete)\s*\(\s*[`'"](\/[^`'"]*)[`'"]/gi,
  // Next.js App Router: export async function GET/POST/PUT/DELETE
  /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/gi,
  // Fastify: fastify.get("/path", handler)
  /fastify\s*\.\s*(get|post|put|patch|delete)\s*\(\s*[`'"](\/[^`'"]*)[`'"]/gi,
  // Python FastAPI: @app.get("/path/..."), @router.post("/login")
  /@(?:app|router)\s*\.\s*(get|post|put|patch|delete)\s*\(\s*[`'"](\/[^`'"]*)[`'"]/gi,
  // NestJS decorators: @Get("/path"), @Post("/path")
  /@(Get|Post|Put|Patch|Delete)\s*\(\s*['"`](\/[^'"`]*)[`'"]\s*\)/gi,
];

async function extractBackendRoutes(projectPath: string): Promise<BackendRoute[]> {
  const routes: BackendRoute[] = [];

  const result = await exec("find", [
    projectPath, "-type", "f",
    "(", "-name", "*.ts", "-o", "-name", "*.tsx", "-o", "-name", "*.js", "-o", "-name", "*.py", ")",
    "-not", "-path", "*/node_modules/*",
    "-not", "-path", "*/.next/*",
    "-not", "-path", "*/dist/*",
    "-not", "-path", "*/.history/*",
    "-not", "-path", "*/.angular/*",
    "-not", "-path", "*/__pycache__/*",
    "-not", "-path", "*/venv/*",
    "-not", "-path", "*/.venv/*",
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
      rel.includes("/routers/") ||
      rel.includes("/endpoints/") ||
      rel.includes("/backend/") ||
      rel.includes("/controllers/") ||
      rel.includes("/modules/") ||
      rel.includes("route.ts") ||
      rel.includes("route.js") ||
      rel.includes(".controller.ts") ||
      rel.includes(".controller.js")
    );
  });

  for (const file of backendFiles.slice(0, 500)) {
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

      // ─── NestJS Controller Prefix Resolution ──────────────────────
      // @Controller('/api/users') + @Get('/:id') = /api/users/:id
      const nestControllerMatch = content.match(/@Controller\s*\(\s*['"`](\/[^'"`]*)['"`]\s*\)/);
      const nestPrefix = nestControllerMatch ? nestControllerMatch[1].replace(/\/+$/, "") : "";

      if (nestPrefix) {
        const nestMethodPattern = /@(Get|Post|Put|Patch|Delete)\s*\(\s*['"`]?(\/[^'"`\s)]*)?['"`]?\s*\)/gi;
        let nestMatch;
        while ((nestMatch = nestMethodPattern.exec(content)) !== null) {
          const beforeMatch = content.slice(0, nestMatch.index);
          const lineNum = beforeMatch.split("\n").length;
          const methodPath = nestMatch[2] || "/";
          const fullPath = nestPrefix + (methodPath === "/" ? "" : methodPath);

          routes.push({
            file: rel,
            line: lineNum,
            method: nestMatch[1].toUpperCase(),
            path: fullPath.replace(/\{([^}]+)\}/g, ":$1"),
            raw: nestMatch[0].slice(0, 120),
          });
        }
      }

      // ─── FastAPI Router Prefix Resolution ──────────────────────────
      // router = APIRouter(prefix="/api/v1") + @router.get("/users") = /api/v1/users
      const fastapiPrefixMatch = content.match(/APIRouter\s*\(\s*(?:prefix\s*=\s*)?['"`](\/[^'"`]*)['"`]/);
      const fastapiPrefix = fastapiPrefixMatch ? fastapiPrefixMatch[1].replace(/\/+$/, "") : "";

      // Check Express/Fastify/Python patterns
      for (const pattern of ROUTE_PATTERNS) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(content)) !== null) {
          if (!match[2]) continue; // Skip Next.js export patterns here
          const beforeMatch = content.slice(0, match.index);
          const lineNum = beforeMatch.split("\n").length;
          let routePath = match[2].replace(/\{([^}]+)\}/g, ":$1"); // Python {id} -> :id

          // Apply FastAPI prefix if this is a @router.method() call
          if (fastapiPrefix && match[0].includes("@router")) {
            routePath = fastapiPrefix + routePath;
          }

          // Skip if NestJS prefix already handled this route
          if (nestPrefix && /@(Get|Post|Put|Patch|Delete)/.test(match[0])) continue;

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

/**
 * Import Validator Agent — validates all import/require statements resolve.
 *
 * Checks that every import in source code resolves to either:
 *   - A local file in the project
 *   - An installed node_modules package
 *   - A Python package in requirements.txt/pyproject.toml
 *
 * Also detects native modules that require build tools (better-sqlite3, sharp, bcrypt).
 */

import { readFile, readdir, access, stat } from "fs/promises";
import path from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ImportError {
  filePath: string;
  lineNumber: number;
  importPath: string;
  errorType: "missing_package" | "missing_local" | "native_module" | "internal_package";
  description: string;
  suggestion: string | null;
}

export interface ImportValidationResult {
  projectPath: string;
  appName: string;
  totalFilesScanned: number;
  totalImportsChecked: number;
  errors: ImportError[];
  nativeModules: string[];
  summary: {
    missingPackages: number;
    missingLocal: number;
    nativeModules: number;
    internalPackages: number;
    total: number;
  };
}

// ─── Known Native Modules ───────────────────────────────────────────────────

const NATIVE_MODULES = new Set([
  "better-sqlite3", "sharp", "bcrypt", "canvas", "node-gyp",
  "node-sass", "sqlite3", "pg-native", "grpc", "cpu-features",
  "re2", "sodium-native", "argon2", "leveldown", "fsevents",
]);

// ─── Node.js Built-in Modules ───────────────────────────────────────────────

const NODE_BUILTINS = new Set([
  "assert", "buffer", "child_process", "cluster", "console", "constants",
  "crypto", "dgram", "dns", "domain", "events", "fs", "http", "http2",
  "https", "inspector", "module", "net", "os", "path", "perf_hooks",
  "process", "punycode", "querystring", "readline", "repl", "stream",
  "string_decoder", "sys", "timers", "tls", "trace_events", "tty",
  "url", "util", "v8", "vm", "wasi", "worker_threads", "zlib",
  "fs/promises", "stream/promises", "timers/promises", "stream/web",
  "node:fs", "node:path", "node:os", "node:crypto", "node:url",
  "node:util", "node:http", "node:https", "node:child_process",
  "node:stream", "node:events", "node:buffer", "node:net",
  "node:worker_threads", "node:test", "node:assert",
]);

// ─── Helpers ────────────────────────────────────────────────────────────────

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

async function walkSourceFiles(dir: string, maxFiles = 1500): Promise<string[]> {
  const results: string[] = [];
  const skip = new Set(["node_modules", ".git", ".next", "dist", "build", "__pycache__", ".venv", "venv", "coverage"]);
  const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py"]);

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

// ─── Import Extraction ──────────────────────────────────────────────────────

interface ExtractedImport {
  importPath: string;
  lineNumber: number;
  language: "js" | "py";
}

function extractJsImports(content: string): ExtractedImport[] {
  const imports: ExtractedImport[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ES import: import ... from "..."
    const esMatch = line.match(/(?:import|export)\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/);
    if (esMatch) {
      imports.push({ importPath: esMatch[1], lineNumber: i + 1, language: "js" });
      continue;
    }

    // Dynamic import: import("...")
    const dynMatch = line.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (dynMatch) {
      imports.push({ importPath: dynMatch[1], lineNumber: i + 1, language: "js" });
      continue;
    }

    // require("...")
    const reqMatch = line.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (reqMatch) {
      imports.push({ importPath: reqMatch[1], lineNumber: i + 1, language: "js" });
    }
  }

  return imports;
}

function extractPyImports(content: string): ExtractedImport[] {
  const imports: ExtractedImport[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // import module / from module import ...
    const match = line.match(/^(?:from\s+(\S+)|import\s+(\S+))/);
    if (match) {
      const mod = (match[1] || match[2]).split(".")[0];
      if (mod && !mod.startsWith("_")) {
        imports.push({ importPath: mod, lineNumber: i + 1, language: "py" });
      }
    }
  }

  return imports;
}

// ─── Validation ─────────────────────────────────────────────────────────────

async function getInstalledPackages(projectPath: string): Promise<Set<string>> {
  const packages = new Set<string>();

  // Read package.json dependencies
  const pkgPath = path.join(projectPath, "package.json");
  if (await exists(pkgPath)) {
    try {
      const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
      for (const key of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
        if (pkg[key]) {
          for (const name of Object.keys(pkg[key])) {
            packages.add(name);
            // Scoped packages: @scope/name
            if (name.startsWith("@")) {
              packages.add(name.split("/")[0]);
            }
          }
        }
      }
    } catch { /* skip */ }
  }

  return packages;
}

async function getPythonPackages(projectPath: string): Promise<Set<string>> {
  const packages = new Set<string>();

  // Python stdlib modules (common ones)
  const stdlib = ["os", "sys", "re", "json", "math", "datetime", "time", "random",
    "collections", "itertools", "functools", "pathlib", "typing", "dataclasses",
    "enum", "abc", "io", "logging", "unittest", "pytest", "asyncio", "threading",
    "subprocess", "shutil", "tempfile", "glob", "csv", "hashlib", "base64",
    "socket", "http", "urllib", "email", "html", "xml", "sqlite3", "configparser",
    "argparse", "textwrap", "copy", "pprint", "traceback", "warnings", "contextlib",
    "decimal", "fractions", "statistics", "secrets", "uuid", "struct", "codecs"];
  for (const m of stdlib) packages.add(m);

  // Read requirements.txt
  const reqPath = path.join(projectPath, "requirements.txt");
  if (await exists(reqPath)) {
    try {
      const content = await readFile(reqPath, "utf-8");
      for (const line of content.split("\n")) {
        const match = line.trim().match(/^([a-zA-Z0-9_-]+)/);
        if (match) packages.add(match[1].toLowerCase().replace(/-/g, "_"));
      }
    } catch { /* skip */ }
  }

  // Read pyproject.toml dependencies
  const pyprojectPath = path.join(projectPath, "pyproject.toml");
  if (await exists(pyprojectPath)) {
    try {
      const content = await readFile(pyprojectPath, "utf-8");
      const depMatch = content.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
      if (depMatch) {
        const deps = depMatch[1].matchAll(/"([a-zA-Z0-9_-]+)/g);
        for (const m of deps) packages.add(m[1].toLowerCase().replace(/-/g, "_"));
      }
    } catch { /* skip */ }
  }

  return packages;
}

function isLocalImport(importPath: string): boolean {
  return importPath.startsWith(".") || importPath.startsWith("/") || importPath.startsWith("~");
}

function getPackageName(importPath: string): string {
  // Handle scoped packages: @scope/package/subpath → @scope/package
  if (importPath.startsWith("@")) {
    const parts = importPath.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : importPath;
  }
  // Regular package: package/subpath → package
  return importPath.split("/")[0];
}

async function resolveLocalImport(filePath: string, importPath: string, projectPath: string): Promise<boolean> {
  const dir = path.dirname(filePath);
  const resolved = path.resolve(dir, importPath);

  // Try exact path
  if (await exists(resolved)) return true;

  // Try with extensions
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"];
  for (const ext of extensions) {
    if (await exists(resolved + ext)) return true;
  }

  // Try as directory with index
  for (const ext of extensions) {
    if (await exists(path.join(resolved, `index${ext}`))) return true;
  }

  return false;
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * Validate all imports in a project resolve correctly.
 */
export async function validateImports(projectPath: string): Promise<ImportValidationResult> {
  const appName = path.basename(projectPath);
  const files = await walkSourceFiles(projectPath);
  const errors: ImportError[] = [];
  const nativeModulesFound = new Set<string>();
  let totalImports = 0;

  // Get installed packages
  const jsPackages = await getInstalledPackages(projectPath);
  const pyPackages = await getPythonPackages(projectPath);

  for (const filePath of files) {
    const relPath = path.relative(projectPath, filePath);
    const ext = path.extname(filePath);

    try {
      const content = await readFile(filePath, "utf-8");
      const imports = ext === ".py"
        ? extractPyImports(content)
        : extractJsImports(content);

      for (const imp of imports) {
        totalImports++;

        if (imp.language === "js") {
          // Skip Node.js builtins
          if (NODE_BUILTINS.has(imp.importPath) || NODE_BUILTINS.has(`node:${imp.importPath}`)) continue;

          if (isLocalImport(imp.importPath)) {
            // Local import — check if file exists
            if (!(await resolveLocalImport(filePath, imp.importPath, projectPath))) {
              errors.push({
                filePath: relPath,
                lineNumber: imp.lineNumber,
                importPath: imp.importPath,
                errorType: "missing_local",
                description: `Local import not found: ${imp.importPath}`,
                suggestion: null,
              });
            }
          } else {
            // Package import
            const pkgName = getPackageName(imp.importPath);

            // Check for native modules
            if (NATIVE_MODULES.has(pkgName)) {
              nativeModulesFound.add(pkgName);
            }

            // Check if package is installed
            if (!jsPackages.has(pkgName)) {
              // Could be an internal/workspace package
              const isScoped = pkgName.startsWith("@");
              errors.push({
                filePath: relPath,
                lineNumber: imp.lineNumber,
                importPath: imp.importPath,
                errorType: isScoped ? "internal_package" : "missing_package",
                description: `Package not in dependencies: ${pkgName}`,
                suggestion: `npm install ${pkgName}`,
              });
            }
          }
        } else if (imp.language === "py") {
          // Python import
          const mod = imp.importPath.toLowerCase().replace(/-/g, "_");
          if (!pyPackages.has(mod)) {
            // Could be a local module
            const localPath = path.join(projectPath, imp.importPath);
            if (!(await exists(localPath)) && !(await exists(localPath + ".py")) && !(await exists(path.join(localPath, "__init__.py")))) {
              errors.push({
                filePath: relPath,
                lineNumber: imp.lineNumber,
                importPath: imp.importPath,
                errorType: "missing_package",
                description: `Python package not in requirements: ${imp.importPath}`,
                suggestion: `pip install ${imp.importPath}`,
              });
            }
          }
        }
      }
    } catch { /* skip */ }
  }

  return {
    projectPath,
    appName,
    totalFilesScanned: files.length,
    totalImportsChecked: totalImports,
    errors,
    nativeModules: Array.from(nativeModulesFound),
    summary: {
      missingPackages: errors.filter(e => e.errorType === "missing_package").length,
      missingLocal: errors.filter(e => e.errorType === "missing_local").length,
      nativeModules: nativeModulesFound.size,
      internalPackages: errors.filter(e => e.errorType === "internal_package").length,
      total: errors.length,
    },
  };
}

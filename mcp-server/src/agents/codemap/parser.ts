/**
 * Code Map — tree-sitter parser loader (STORY-001).
 *
 * WASM-first: uses `web-tree-sitter` + prebuilt grammars from `tree-sitter-wasms`,
 * so `npm ci` needs no native toolchain (PRD Risk R-001). The native binding is
 * never required.
 *
 * Contract:
 *  - Unsupported extension      → parseFile returns null (caller emits a file node only)
 *  - Oversize / unreadable file → parseFile returns null + reason (caller emits warning)
 *  - Syntactically broken file  → returns a Tree with error nodes (never throws)
 */

import Parser from "web-tree-sitter";
import { createRequire } from "module";
import { readFile, stat } from "fs/promises";
import path from "path";

const require = createRequire(import.meta.url);

export type SupportedLang = "typescript" | "tsx" | "javascript" | "python";

/** Extension → language. Anything not listed is unsupported (file-level node only). */
const EXT_LANG: Record<string, SupportedLang> = {
  ".ts": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
};

const WASM_MODULE: Record<SupportedLang, string> = {
  typescript: "tree-sitter-wasms/out/tree-sitter-typescript.wasm",
  tsx: "tree-sitter-wasms/out/tree-sitter-tsx.wasm",
  javascript: "tree-sitter-wasms/out/tree-sitter-javascript.wasm",
  python: "tree-sitter-wasms/out/tree-sitter-python.wasm",
};

/** Skip files larger than this to bound memory; caller records a warning. */
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

let initPromise: Promise<void> | null = null;
const languageCache = new Map<SupportedLang, Parser.Language>();

export function langForPath(filePath: string): SupportedLang | null {
  return EXT_LANG[path.extname(filePath).toLowerCase()] ?? null;
}

async function ensureInit(): Promise<void> {
  if (!initPromise) initPromise = Parser.init();
  await initPromise;
}

async function loadLanguage(lang: SupportedLang): Promise<Parser.Language> {
  const cached = languageCache.get(lang);
  if (cached) return cached;
  await ensureInit();
  const wasmPath = require.resolve(WASM_MODULE[lang]);
  const language = await Parser.Language.load(wasmPath);
  languageCache.set(lang, language);
  return language;
}

export interface ParseResult {
  lang: SupportedLang;
  language: Parser.Language;
  tree: Parser.Tree;
}

export type ParseSkipReason = "unsupported" | "too-large" | "unreadable";

export interface ParseSkip {
  skipped: ParseSkipReason;
}

export function isSkip(r: ParseResult | ParseSkip): r is ParseSkip {
  return (r as ParseSkip).skipped !== undefined;
}

/**
 * Parse a single file. Returns a ParseResult (possibly with error nodes) on success,
 * or a ParseSkip describing why parsing was skipped. Never throws on bad input.
 */
export async function parseFile(absPath: string): Promise<ParseResult | ParseSkip> {
  const lang = langForPath(absPath);
  if (!lang) return { skipped: "unsupported" };

  let source: string;
  try {
    const info = await stat(absPath);
    if (info.size > MAX_FILE_BYTES) return { skipped: "too-large" };
    source = await readFile(absPath, "utf-8");
  } catch {
    return { skipped: "unreadable" };
  }

  const language = await loadLanguage(lang);
  const parser = new Parser();
  parser.setLanguage(language);
  const tree = parser.parse(source); // tree-sitter sets error nodes; it does not throw
  return { lang, language, tree };
}

/**
 * Artifact Harvester — ingests SkillFoundry in-project artifacts into the MCP knowledge store.
 *
 * Harvests these artifact types before cleanup:
 *   1. scratchpad.md     — Forge session notes, decisions, progress tracking
 *   2. memory_bank/      — Knowledge files (JSONL decisions, errors, assessments)
 *   3. genesis/ PRDs     — Product requirements documents with feature specs
 *   4. docs/stories/     — Implementation stories with acceptance criteria
 *   5. CLAUDE.md         — Project-specific rules and conventions
 *   6. agents/ protocols — Autonomous protocol, intent classifier, env preflight
 *   7. _known-deviations — LLM failure pattern catalog
 *   8. ANTI_PATTERNS_*   — Depth and breadth anti-pattern documents
 *   9. .claude/backups/  — Historical snapshots of agent configs (sampled)
 */

import { readFile, readdir, stat, access } from "fs/promises";
import path from "path";
import {
  initDatabase,
  upsertProjectArtifact,
  getArtifactStats,
  type ProjectArtifactType,
  type ProjectArtifactRecord,
} from "../state/db.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ArtifactHarvestResult {
  totalArtifacts: number;
  byType: Record<string, number>;
  byProject: Record<string, number>;
  totalBytes: number;
  errors: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [ARTIFACT-HARVEST] ${msg}`);
}

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

async function safeReaddir(p: string): Promise<string[]> {
  try { return await readdir(p); } catch { return []; }
}

async function safeReadFile(p: string, maxBytes = 500_000): Promise<string | null> {
  try {
    const s = await stat(p);
    if (s.size > maxBytes) return null; // skip oversized files
    return await readFile(p, "utf-8");
  } catch {
    return null;
  }
}

async function fileSize(p: string): Promise<number> {
  try { return (await stat(p)).size; } catch { return 0; }
}

// ─── Individual Harvesters ──────────────────────────────────────────────────

async function harvestScratchpads(
  projectPaths: string[],
  results: ArtifactHarvestResult
): Promise<void> {
  for (const projectPath of projectPaths) {
    const appName = path.basename(projectPath);
    const scratchpadPath = path.join(projectPath, ".claude", "scratchpad.md");
    const content = await safeReadFile(scratchpadPath);
    if (!content || content.length < 50) continue;

    if (upsertProjectArtifact({
      appName,
      appPath: projectPath,
      artifactType: "scratchpad",
      artifactPath: scratchpadPath,
      title: extractTitle(content) || `${appName} scratchpad`,
      content,
      contentSizeBytes: Buffer.byteLength(content),
      metadata: { lines: content.split("\n").length },
    })) {
      results.totalArtifacts++;
      results.byType["scratchpad"] = (results.byType["scratchpad"] || 0) + 1;
      results.byProject[appName] = (results.byProject[appName] || 0) + 1;
      results.totalBytes += Buffer.byteLength(content);
    }
  }
}

async function harvestMemoryBanks(
  projectPaths: string[],
  results: ArtifactHarvestResult
): Promise<void> {
  for (const projectPath of projectPaths) {
    const appName = path.basename(projectPath);
    const memoryDir = path.join(projectPath, "memory_bank");
    if (!(await exists(memoryDir))) continue;

    const files = await walkFiles(memoryDir);
    for (const filePath of files) {
      if (!filePath.endsWith(".jsonl") && !filePath.endsWith(".md") && !filePath.endsWith(".json")) continue;
      const content = await safeReadFile(filePath);
      if (!content || content.length < 20) continue;

      const relPath = path.relative(projectPath, filePath);
      if (upsertProjectArtifact({
        appName,
        appPath: projectPath,
        artifactType: "memory_bank",
        artifactPath: relPath,
        title: path.basename(filePath, path.extname(filePath)),
        content,
        contentSizeBytes: Buffer.byteLength(content),
        metadata: {
          fileType: path.extname(filePath),
          entryCount: filePath.endsWith(".jsonl") ? content.split("\n").filter(l => l.trim()).length : null,
        },
      })) {
        results.totalArtifacts++;
        results.byType["memory_bank"] = (results.byType["memory_bank"] || 0) + 1;
        results.byProject[appName] = (results.byProject[appName] || 0) + 1;
        results.totalBytes += Buffer.byteLength(content);
      }
    }
  }
}

async function harvestGenesisPRDs(
  projectPaths: string[],
  results: ArtifactHarvestResult
): Promise<void> {
  for (const projectPath of projectPaths) {
    const appName = path.basename(projectPath);
    const genesisDir = path.join(projectPath, "genesis");
    if (!(await exists(genesisDir))) continue;

    const files = await safeReaddir(genesisDir);
    for (const file of files) {
      if (!file.endsWith(".md") || file === "TEMPLATE.md") continue;
      const filePath = path.join(genesisDir, file);
      const content = await safeReadFile(filePath);
      if (!content || content.length < 50) continue;

      if (upsertProjectArtifact({
        appName,
        appPath: projectPath,
        artifactType: "genesis_prd",
        artifactPath: `genesis/${file}`,
        title: extractTitle(content) || file.replace(".md", ""),
        content,
        contentSizeBytes: Buffer.byteLength(content),
        metadata: { fileName: file },
      })) {
        results.totalArtifacts++;
        results.byType["genesis_prd"] = (results.byType["genesis_prd"] || 0) + 1;
        results.byProject[appName] = (results.byProject[appName] || 0) + 1;
        results.totalBytes += Buffer.byteLength(content);
      }
    }
  }
}

async function harvestStories(
  projectPaths: string[],
  results: ArtifactHarvestResult
): Promise<void> {
  for (const projectPath of projectPaths) {
    const appName = path.basename(projectPath);
    const storiesDir = path.join(projectPath, "docs", "stories");
    if (!(await exists(storiesDir))) continue;

    const files = await walkFiles(storiesDir);
    for (const filePath of files) {
      if (!filePath.endsWith(".md")) continue;
      const content = await safeReadFile(filePath);
      if (!content || content.length < 50) continue;

      const relPath = path.relative(projectPath, filePath);
      if (upsertProjectArtifact({
        appName,
        appPath: projectPath,
        artifactType: "story",
        artifactPath: relPath,
        title: extractTitle(content) || path.basename(filePath, ".md"),
        content,
        contentSizeBytes: Buffer.byteLength(content),
        metadata: { fileName: path.basename(filePath) },
      })) {
        results.totalArtifacts++;
        results.byType["story"] = (results.byType["story"] || 0) + 1;
        results.byProject[appName] = (results.byProject[appName] || 0) + 1;
        results.totalBytes += Buffer.byteLength(content);
      }
    }
  }
}

async function harvestClaudeMd(
  projectPaths: string[],
  results: ArtifactHarvestResult
): Promise<void> {
  for (const projectPath of projectPaths) {
    const appName = path.basename(projectPath);

    // Check root CLAUDE.md and .claude/CLAUDE.md
    for (const relPath of ["CLAUDE.md", ".claude/CLAUDE.md"]) {
      const filePath = path.join(projectPath, relPath);
      const content = await safeReadFile(filePath);
      if (!content || content.length < 50) continue;

      if (upsertProjectArtifact({
        appName,
        appPath: projectPath,
        artifactType: "claude_md",
        artifactPath: relPath,
        title: `${appName} CLAUDE.md (${relPath})`,
        content,
        contentSizeBytes: Buffer.byteLength(content),
        metadata: { location: relPath.includes(".claude") ? "platform_dir" : "root" },
      })) {
        results.totalArtifacts++;
        results.byType["claude_md"] = (results.byType["claude_md"] || 0) + 1;
        results.byProject[appName] = (results.byProject[appName] || 0) + 1;
        results.totalBytes += Buffer.byteLength(content);
      }
    }
  }
}

async function harvestAgentProtocols(
  projectPaths: string[],
  results: ArtifactHarvestResult
): Promise<void> {
  const protocolFiles = [
    "_autonomous-protocol.md",
    "_intent-classifier.md",
    "_env-preflight-protocol.md",
    "_known-deviations.md",
    "_agent-protocol.md",
    "_anvil-protocol.md",
    "_context-discipline.md",
    "_contract-enforcement.md",
    "_error-handling-protocol.md",
    "_deliberation-protocol.md",
  ];

  for (const projectPath of projectPaths) {
    const appName = path.basename(projectPath);
    const agentsDir = path.join(projectPath, "agents");
    if (!(await exists(agentsDir))) continue;

    const allFiles = await safeReaddir(agentsDir);
    // Harvest protocol files (prefixed with _) and key agent definitions
    const targetFiles = allFiles.filter(f =>
      f.endsWith(".md") && (f.startsWith("_") || protocolFiles.includes(f))
    );

    for (const file of targetFiles) {
      const filePath = path.join(agentsDir, file);
      const content = await safeReadFile(filePath);
      if (!content || content.length < 50) continue;

      const artifactType: ProjectArtifactType =
        file === "_known-deviations.md" ? "known_deviations" : "agent_protocol";

      if (upsertProjectArtifact({
        appName,
        appPath: projectPath,
        artifactType,
        artifactPath: `agents/${file}`,
        title: file.replace(".md", "").replace(/^_/, ""),
        content,
        contentSizeBytes: Buffer.byteLength(content),
        metadata: { fileName: file },
      })) {
        results.totalArtifacts++;
        const typeKey = artifactType;
        results.byType[typeKey] = (results.byType[typeKey] || 0) + 1;
        results.byProject[appName] = (results.byProject[appName] || 0) + 1;
        results.totalBytes += Buffer.byteLength(content);
      }
    }
  }
}

async function harvestAntiPatterns(
  projectPaths: string[],
  results: ArtifactHarvestResult
): Promise<void> {
  const targets = ["ANTI_PATTERNS_DEPTH.md", "ANTI_PATTERNS_BREADTH.md"];

  for (const projectPath of projectPaths) {
    const appName = path.basename(projectPath);

    for (const fileName of targets) {
      // Check docs/ and root
      for (const dir of ["docs", "."]) {
        const filePath = path.join(projectPath, dir, fileName);
        const content = await safeReadFile(filePath);
        if (!content || content.length < 50) continue;

        const relPath = dir === "." ? fileName : `${dir}/${fileName}`;
        if (upsertProjectArtifact({
          appName,
          appPath: projectPath,
          artifactType: "anti_patterns",
          artifactPath: relPath,
          title: fileName.replace(".md", ""),
          content,
          contentSizeBytes: Buffer.byteLength(content),
          metadata: { location: dir },
        })) {
          results.totalArtifacts++;
          results.byType["anti_patterns"] = (results.byType["anti_patterns"] || 0) + 1;
          results.byProject[appName] = (results.byProject[appName] || 0) + 1;
          results.totalBytes += Buffer.byteLength(content);
        }
        break; // don't double-harvest same file
      }
    }
  }
}

async function harvestBackupSnapshots(
  projectPaths: string[],
  results: ArtifactHarvestResult
): Promise<void> {
  for (const projectPath of projectPaths) {
    const appName = path.basename(projectPath);
    const backupsDir = path.join(projectPath, ".claude", "backups");
    if (!(await exists(backupsDir))) continue;

    const backupDirs = await safeReaddir(backupsDir);
    // Only harvest the most recent backup to avoid bloat
    const sortedDirs = backupDirs
      .filter(d => /^\d{8}_\d{6}$/.test(d))
      .sort()
      .reverse();

    const latestDir = sortedDirs[0];
    if (!latestDir) continue;

    const latestPath = path.join(backupsDir, latestDir);
    const files = await walkFiles(latestPath);

    for (const filePath of files) {
      if (!filePath.endsWith(".md")) continue;
      const content = await safeReadFile(filePath, 100_000); // smaller limit for backups
      if (!content || content.length < 50) continue;

      const relPath = path.relative(projectPath, filePath);
      if (upsertProjectArtifact({
        appName,
        appPath: projectPath,
        artifactType: "backup_snapshot",
        artifactPath: relPath,
        title: `${path.basename(filePath, ".md")} (${latestDir})`,
        content,
        contentSizeBytes: Buffer.byteLength(content),
        metadata: { backupDate: latestDir, fileName: path.basename(filePath) },
      })) {
        results.totalArtifacts++;
        results.byType["backup_snapshot"] = (results.byType["backup_snapshot"] || 0) + 1;
        results.byProject[appName] = (results.byProject[appName] || 0) + 1;
        results.totalBytes += Buffer.byteLength(content);
      }
    }
  }
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function extractTitle(content: string): string | null {
  const firstLine = content.split("\n").find(l => l.trim());
  if (!firstLine) return null;
  // Remove markdown heading markers
  const match = firstLine.match(/^#+\s+(.+)/);
  return match ? match[1].trim() : null;
}

async function walkFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        results.push(...await walkFiles(fullPath));
      } else {
        results.push(fullPath);
      }
    }
  } catch { /* skip inaccessible */ }
  return results;
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * Harvest all SkillFoundry in-project artifacts into the MCP knowledge store.
 * Run this BEFORE cleaning up the artifacts from projects.
 */
export async function harvestProjectArtifacts(
  roots: string[],
  dbPath?: string
): Promise<ArtifactHarvestResult> {
  await initDatabase(dbPath);

  const results: ArtifactHarvestResult = {
    totalArtifacts: 0,
    byType: {},
    byProject: {},
    totalBytes: 0,
    errors: [],
  };

  // Discover all project paths
  const projectPaths: string[] = [];
  for (const root of roots) {
    try {
      const entries = await readdir(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith(".") ||
            entry.name === "node_modules" || entry.name === "archive") continue;
        projectPaths.push(path.join(root, entry.name));
      }
    } catch { /* skip inaccessible roots */ }
  }

  // Also check root-level artifacts (~/apps/ itself may have SF infra)
  for (const root of roots) {
    if (await exists(path.join(root, "CLAUDE.md")) ||
        await exists(path.join(root, "agents")) ||
        await exists(path.join(root, "genesis"))) {
      projectPaths.push(root);
    }
  }

  log(`Discovered ${projectPaths.length} projects across ${roots.length} roots`);

  // Run all harvesters
  const harvesters = [
    { name: "scratchpads", fn: harvestScratchpads },
    { name: "memory_banks", fn: harvestMemoryBanks },
    { name: "genesis_prds", fn: harvestGenesisPRDs },
    { name: "stories", fn: harvestStories },
    { name: "claude_md", fn: harvestClaudeMd },
    { name: "agent_protocols", fn: harvestAgentProtocols },
    { name: "anti_patterns", fn: harvestAntiPatterns },
    { name: "backup_snapshots", fn: harvestBackupSnapshots },
  ];

  for (const { name, fn } of harvesters) {
    try {
      log(`Harvesting ${name}...`);
      await fn(projectPaths, results);
      log(`  ${results.byType[name.replace("s", "").replace("_", "_")] || Object.values(results.byType).reduce((a, b) => a + b, 0)} total so far`);
    } catch (err) {
      const msg = `${name} failed: ${err instanceof Error ? err.message : String(err)}`;
      log(`  ERROR: ${msg}`);
      results.errors.push(msg);
    }
  }

  log(`Harvest complete: ${results.totalArtifacts} artifacts, ${(results.totalBytes / 1024).toFixed(0)} KB`);

  // Log final stats
  const stats = getArtifactStats();
  log(`DB stats: ${JSON.stringify(stats)}`);

  return results;
}

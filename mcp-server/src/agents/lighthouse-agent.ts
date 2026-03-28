import { exec, commandExists } from "./exec-utils.js";
import { readFile, mkdir } from "fs/promises";
import path from "path";

export interface LighthouseResult {
  passed: boolean;
  available: boolean;
  scores: {
    performance: number;
    accessibility: number;
    bestPractices: number;
    seo: number;
  } | null;
  audits: LighthouseAudit[];
  reportPath: string | null;
  duration: number;
}

interface LighthouseAudit {
  id: string;
  title: string;
  score: number;
  displayValue: string;
}

/**
 * Run Lighthouse performance audit on a URL.
 */
export async function runLighthouse(
  url: string,
  evidenceDir?: string
): Promise<LighthouseResult> {
  const start = Date.now();
  const outDir = evidenceDir || "/tmp/sf-lighthouse-evidence";
  await mkdir(outDir, { recursive: true });

  // Check if lighthouse is available (via Chrome/Chromium)
  const hasLighthouse = await commandExists("lighthouse") ||
    await commandExists("npx");

  if (!hasLighthouse) {
    return {
      passed: false,
      available: false,
      scores: null,
      audits: [],
      reportPath: null,
      duration: Date.now() - start,
    };
  }

  const reportPath = path.join(outDir, "lighthouse-report.json");

  const result = await exec(
    "npx",
    [
      "lighthouse", url,
      "--output=json",
      `--output-path=${reportPath}`,
      "--chrome-flags=--headless --no-sandbox --disable-gpu",
      "--quiet",
      "--only-categories=performance,accessibility,best-practices,seo",
    ],
    { timeout: 120000 }
  );

  if (!result.success) {
    return {
      passed: false,
      available: true,
      scores: null,
      audits: [],
      reportPath: null,
      duration: result.duration,
    };
  }

  try {
    const report = JSON.parse(await readFile(reportPath, "utf-8"));
    const categories = report.categories || {};

    const scores = {
      performance: Math.round((categories.performance?.score || 0) * 100),
      accessibility: Math.round((categories.accessibility?.score || 0) * 100),
      bestPractices: Math.round((categories["best-practices"]?.score || 0) * 100),
      seo: Math.round((categories.seo?.score || 0) * 100),
    };

    // Extract key audits
    const audits: LighthouseAudit[] = [];
    const keyAuditIds = [
      "first-contentful-paint", "largest-contentful-paint",
      "total-blocking-time", "cumulative-layout-shift",
      "speed-index", "interactive",
    ];

    for (const id of keyAuditIds) {
      const audit = report.audits?.[id];
      if (audit) {
        audits.push({
          id,
          title: audit.title,
          score: audit.score ?? 0,
          displayValue: audit.displayValue || "",
        });
      }
    }

    return {
      passed: scores.performance >= 70 && scores.accessibility >= 80,
      available: true,
      scores,
      audits,
      reportPath,
      duration: Date.now() - start,
    };
  } catch {
    return {
      passed: false,
      available: true,
      scores: null,
      audits: [],
      reportPath,
      duration: Date.now() - start,
    };
  }
}

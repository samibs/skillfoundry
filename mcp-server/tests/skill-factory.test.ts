import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { exportAsClaudeSkill, type DynamicSkill } from "../src/agents/skill-factory.js";
import { initDatabase, closeDatabase, insertDynamicSkill, getCertifiedSkills, getDynamicSkill, listDynamicSkills } from "../src/state/db.js";
import { mkdtemp } from "fs/promises";
import path from "path";
import { tmpdir } from "os";

// ─── Mock Skill (simulates what createSkill() returns) ──────────────────────

const mockCertifiedSkill: DynamicSkill = {
  id: "test-skill-001",
  name: "Code Review Assistant",
  description: "Analyzes code changes and provides structured review feedback with severity levels.",
  domain: "technical",
  riskLevel: "medium",
  status: "certified",
  inputSchema: {
    type: "object",
    properties: {
      code: { type: "string", description: "Code diff or file content to review" },
      language: { type: "string", description: "Programming language" },
    },
    required: ["code"],
  },
  outputSchema: {
    type: "object",
    properties: {
      findings: { type: "array", description: "List of review findings" },
      severity: { type: "string", description: "Overall severity: low/medium/high" },
    },
    required: ["findings"],
  },
  scope: [
    "Analyze code for bugs, security issues, and best practice violations",
    "Provide actionable improvement suggestions",
    "Identify potential performance problems",
  ],
  outOfScope: [
    "Execute or compile code",
    "Make changes to the codebase",
    "Provide legal advice about licensing",
  ],
  guardrails: [
    { type: "HALLUCINATION_POLICY", description: "Must cite specific lines when referencing code", config: { requiresConfidenceScore: true }, validated: true },
    { type: "UNKNOWN_HANDLING", description: "Acknowledge when unfamiliar with a language or pattern", config: { prohibitGuessing: true }, validated: true },
    { type: "SOURCE_GROUNDING", description: "Reference official language docs for best practices", config: { requireSourceAttribution: false }, validated: true },
    { type: "SCOPE_ENFORCEMENT", description: "Review only, never modify code", config: { enforceStrictScope: true }, validated: true },
    { type: "AUDIT_TRAIL", description: "Log all review sessions", config: { logLevel: "standard" }, validated: true },
    { type: "VERSION_CONTRACT", description: "Semantic versioning for review criteria changes", config: { currentVersion: "1.0.0" }, validated: true },
  ],
  testResults: {
    passCount: 9,
    failCount: 1,
    score: 0.9,
    results: [
      { id: "test-001", input: { code: "x = 1/0" }, expectedBehavior: "Flag division by zero", actualBehavior: "Flagged correctly", passed: true, reasoning: "Caught obvious bug" },
    ],
  },
  tags: ["code-review", "static-analysis", "best-practices"],
  language: "multi",
  targetModels: ["claude", "gpt"],
  complianceFrameworks: [],
  version: "1.0.0",
  createdAt: "2026-03-28T12:00:00Z",
  certifiedAt: "2026-03-28T12:00:05Z",
  exportedContent: null,
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Skill Factory — Export", () => {
  it("exports a certified skill as Claude .md format", () => {
    const exported = exportAsClaudeSkill(mockCertifiedSkill);

    expect(exported).toContain("# Code Review Assistant");
    expect(exported).toContain("SkillFoundry Certified Skill");
    expect(exported).toContain("<system_instructions>");
    expect(exported).toContain("</system_instructions>");
    expect(exported).toContain("<scope>");
    expect(exported).toContain("Analyze code for bugs");
    expect(exported).toContain("<out_of_scope>");
    expect(exported).toContain("Execute or compile code");
    expect(exported).toContain('<guardrail type="HALLUCINATION_POLICY">');
    expect(exported).toContain('<guardrail type="SCOPE_ENFORCEMENT">');
    expect(exported).toContain("## Tool Definition");
    expect(exported).toContain("## Output Schema");
    expect(exported).toContain("code-review");
  });

  it("exported content is valid .md that SkillFoundry can load", () => {
    const exported = exportAsClaudeSkill(mockCertifiedSkill);

    // Must start with H1 heading (skill loader extracts name from this)
    expect(exported).toMatch(/^# .+/);

    // Must have content (not empty)
    expect(exported.length).toBeGreaterThan(500);

    // Must not have any undefined or null strings
    expect(exported).not.toContain("undefined");
    expect(exported).not.toContain("null");
  });
});

describe("Skill Factory — SQLite Storage", () => {
  beforeAll(async () => {
    const tmpDir = await mkdtemp(path.join(tmpdir(), "sf-factory-test-"));
    await initDatabase(path.join(tmpDir, "test.db"));
  });

  afterAll(() => {
    closeDatabase();
  });

  it("inserts and retrieves a dynamic skill", () => {
    const skill = { ...mockCertifiedSkill, exportedContent: exportAsClaudeSkill(mockCertifiedSkill) };
    insertDynamicSkill(skill);

    const retrieved = getDynamicSkill("test-skill-001");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.name).toBe("Code Review Assistant");
    expect(retrieved!.status).toBe("certified");
    expect(retrieved!.guardrails).toHaveLength(6);
    expect(retrieved!.testResults?.score).toBe(0.9);
    expect(retrieved!.exportedContent).toContain("<system_instructions>");
  });

  it("retrieves by name", () => {
    const retrieved = getDynamicSkill("Code Review Assistant");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe("test-skill-001");
  });

  it("lists all dynamic skills", () => {
    const all = listDynamicSkills();
    expect(all.length).toBeGreaterThan(0);
  });

  it("getCertifiedSkills returns only certified", () => {
    // Insert a failed skill
    const failed: DynamicSkill = {
      ...mockCertifiedSkill,
      id: "test-skill-002",
      name: "Failed Skill",
      status: "failed",
      testResults: { passCount: 5, failCount: 5, score: 0.5, results: [] },
      certifiedAt: null,
      exportedContent: null,
    };
    insertDynamicSkill(failed);

    const certified = getCertifiedSkills();
    expect(certified.every((s) => s.status === "certified")).toBe(true);
    expect(certified.find((s) => s.name === "Failed Skill")).toBeUndefined();
  });
});

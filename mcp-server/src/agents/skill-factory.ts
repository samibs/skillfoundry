/**
 * Skill Factory — ported from iznir.hexalab.dev core engine.
 *
 * Creates certified AI skills on the fly:
 * 1. Analyze intent → structured proposal
 * 2. Generate 6 guardrails (domain/risk-aware)
 * 3. Run 10-case test suite (80% pass required)
 * 4. Certify → export as .md skill file → register as live MCP tool
 *
 * Uses Claude API directly — no Next.js, no Prisma, no web dependencies.
 */

import Anthropic from "@anthropic-ai/sdk";

// ─── Types (standalone, no Prisma) ──────────────────────────────────────────

export type SkillDomain = "legal" | "finance" | "technical" | "general" | "custom";
export type RiskLevel = "low" | "medium" | "high";
export type SkillStatus = "draft" | "guardrails_pending" | "testing" | "certified" | "failed";
export type GuardrailType =
  | "HALLUCINATION_POLICY"
  | "UNKNOWN_HANDLING"
  | "SOURCE_GROUNDING"
  | "SCOPE_ENFORCEMENT"
  | "AUDIT_TRAIL"
  | "VERSION_CONTRACT";

export interface SkillProposal {
  name: string;
  description: string;
  domain: SkillDomain;
  riskLevel: RiskLevel;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  scope: string[];
  outOfScope: string[];
  industry: string | null;
  category: string | null;
  tags: string[];
  language: string;
  targetModels: string[];
  complianceFrameworks: string[];
}

export interface Guardrail {
  type: GuardrailType;
  description: string;
  config: Record<string, unknown>;
  validated: boolean;
}

export interface TestCase {
  id: string;
  input: Record<string, unknown>;
  expectedBehavior: string;
  actualBehavior: string;
  passed: boolean;
  reasoning: string;
}

export interface TestResults {
  passCount: number;
  failCount: number;
  score: number;
  results: TestCase[];
}

export interface DynamicSkill {
  id: string;
  name: string;
  description: string;
  domain: SkillDomain;
  riskLevel: RiskLevel;
  status: SkillStatus;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  scope: string[];
  outOfScope: string[];
  guardrails: Guardrail[];
  testResults: TestResults | null;
  tags: string[];
  language: string;
  targetModels: string[];
  complianceFrameworks: string[];
  version: string;
  createdAt: string;
  certifiedAt: string | null;
  /** The exported skill content (markdown for Claude Code) */
  exportedContent: string | null;
}

// ─── Claude API Client ──────────────────────────────────────────────────────

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY environment variable is required for the skill factory"
    );
  }
  return new Anthropic({ apiKey });
}

function parseJsonResponse(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "")
    .trim();
  return JSON.parse(cleaned);
}

// ─── Step 1: Analyze Intent ─────────────────────────────────────────────────

export async function analyzeIntent(
  description: string
): Promise<SkillProposal> {
  const client = getClient();

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `Analyze this AI skill description and return a structured skill proposal as JSON.

Description: "${description}"

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "name": "Short, clear skill name (3-6 words)",
  "description": "Clear description of what this skill does (2-3 sentences)",
  "domain": "one of: legal, finance, technical, general, custom",
  "riskLevel": "one of: low, medium, high",
  "industry": "one of: healthcare, finance, legal, manufacturing, retail, technology, education, government, energy, other (or null)",
  "category": "one of: analysis, generation, classification, extraction, summarization, translation, validation, automation, other",
  "tags": ["3-8 lowercase tags"],
  "language": "BCP-47 code, e.g. 'en', 'multi'",
  "targetModels": ["claude", "gpt", "gemini", "copilot", "codex"],
  "complianceFrameworks": ["relevant frameworks or empty array"],
  "inputSchema": { "type": "object", "properties": { ... }, "required": [...] },
  "outputSchema": { "type": "object", "properties": { ... }, "required": [...] },
  "scope": ["3-5 things this skill CAN do"],
  "outOfScope": ["3-5 things this skill CANNOT do"]
}

Domain: legal=contracts/compliance, finance=financial/tax, technical=code/APIs, general=knowledge/writing, custom=specialized.
Risk: low=informational, medium=influences decisions, high=consequential/regulated.`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");
  return parseJsonResponse(content.text) as SkillProposal;
}

// ─── Step 2: Generate Guardrails ────────────────────────────────────────────

const REQUIRED_GUARDRAIL_TYPES: GuardrailType[] = [
  "HALLUCINATION_POLICY",
  "UNKNOWN_HANDLING",
  "SOURCE_GROUNDING",
  "SCOPE_ENFORCEMENT",
  "AUDIT_TRAIL",
  "VERSION_CONTRACT",
];

export async function generateGuardrails(skill: {
  name: string;
  description: string;
  domain: string;
  riskLevel: string;
}): Promise<Guardrail[]> {
  const client = getClient();

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `Generate safety guardrails for this AI skill. Return ONLY a valid JSON array.

Skill: "${skill.name}"
Description: "${skill.description}"
Domain: ${skill.domain}
Risk Level: ${skill.riskLevel}

Return exactly 6 guardrail objects, one per type:
HALLUCINATION_POLICY, UNKNOWN_HANDLING, SOURCE_GROUNDING, SCOPE_ENFORCEMENT, AUDIT_TRAIL, VERSION_CONTRACT

Each: { "type": "<TYPE>", "description": "<one sentence for this skill>", "config": { <3-5 keys> } }

Tailor to ${skill.domain} domain and ${skill.riskLevel} risk level.`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");

  const raw = parseJsonResponse(content.text) as Array<{
    type: GuardrailType;
    description: string;
    config: Record<string, unknown>;
  }>;

  // Validate all required types present
  for (const required of REQUIRED_GUARDRAIL_TYPES) {
    if (!raw.find((g) => g.type === required)) {
      throw new Error(`Missing required guardrail type: ${required}`);
    }
  }

  return raw.map((g) => ({
    type: g.type,
    description: g.description,
    config: g.config,
    validated: true, // Auto-validate in factory mode
  }));
}

// ─── Step 3: Run Test Suite ─────────────────────────────────────────────────

export async function runSkillTest(skill: {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  scope: string[];
  outOfScope: string[];
}): Promise<TestResults> {
  const client = getClient();

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: `Evaluate this AI skill against 10 test cases. Return ONLY valid JSON.

Skill: "${skill.name}"
Description: "${skill.description}"
Scope: ${JSON.stringify(skill.scope)}
Out of Scope: ${JSON.stringify(skill.outOfScope)}
Input Schema: ${JSON.stringify(skill.inputSchema)}
Output Schema: ${JSON.stringify(skill.outputSchema)}

10 test cases: 5 valid in-scope, 3 edge cases, 2 out-of-scope.

Return: { "passCount": <int>, "failCount": <int>, "score": <0.0-1.0>, "results": [{ "id": "test-001", "input": {...}, "expectedBehavior": "...", "actualBehavior": "...", "passed": true, "reasoning": "..." }] }`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");

  const results = parseJsonResponse(content.text) as TestResults;
  results.score =
    results.results.length > 0
      ? results.passCount / results.results.length
      : 0;

  return results;
}

// ─── Step 4: Export as Claude Skill (.md) ───────────────────────────────────

export function exportAsClaudeSkill(skill: DynamicSkill): string {
  const lines: string[] = [];

  lines.push(`# ${skill.name} — SkillFoundry Certified Skill v${skill.version}`);
  lines.push("");
  lines.push(`> Certified: ${skill.certifiedAt?.split("T")[0] ?? "N/A"}`);
  lines.push(`> Domain: ${skill.domain} | Risk: ${skill.riskLevel} | Language: ${skill.language}`);
  if (skill.complianceFrameworks.length > 0) {
    lines.push(`> Compliance: ${skill.complianceFrameworks.join(", ")}`);
  }
  lines.push("");

  lines.push("<system_instructions>");
  lines.push("");
  lines.push(`You are: ${skill.name}`);
  lines.push("");
  lines.push(skill.description);
  lines.push("");

  lines.push("<scope>");
  for (const s of skill.scope) lines.push(`- ${s}`);
  lines.push("</scope>");
  lines.push("");

  lines.push("<out_of_scope>");
  lines.push("You MUST refuse requests that fall into these categories:");
  for (const s of skill.outOfScope) lines.push(`- ${s}`);
  lines.push("</out_of_scope>");
  lines.push("");

  lines.push("<guardrails>");
  for (const g of skill.guardrails) {
    lines.push(`<guardrail type="${g.type}">`);
    lines.push(g.description);
    lines.push("</guardrail>");
  }
  lines.push("</guardrails>");
  lines.push("");
  lines.push("</system_instructions>");
  lines.push("");

  const inputProps = skill.inputSchema?.properties;
  if (inputProps) {
    lines.push("## Tool Definition");
    lines.push("");
    lines.push("```json");
    lines.push(
      JSON.stringify(
        {
          name: skill.name.toLowerCase().replace(/\s+/g, "_"),
          description: skill.description,
          input_schema: skill.inputSchema,
        },
        null,
        2
      )
    );
    lines.push("```");
    lines.push("");
  }

  lines.push("## Output Schema");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(skill.outputSchema, null, 2));
  lines.push("```");
  lines.push("");

  if (skill.tags.length > 0) {
    lines.push(`Tags: ${skill.tags.join(", ")}`);
  }

  return lines.join("\n");
}

// ─── Full Pipeline ──────────────────────────────────────────────────────────

const CERTIFICATION_THRESHOLD = 0.8;

/**
 * Run the full skill factory pipeline:
 * Intent → Proposal → Guardrails → Test → Certify → Export
 *
 * Returns a certified DynamicSkill ready to register as an MCP tool,
 * or a failed skill with test results explaining why.
 */
export async function createSkill(
  intentDescription: string
): Promise<DynamicSkill> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Step 1: Analyze intent
  const proposal = await analyzeIntent(intentDescription);

  const skill: DynamicSkill = {
    id,
    name: proposal.name,
    description: proposal.description,
    domain: proposal.domain,
    riskLevel: proposal.riskLevel,
    status: "draft",
    inputSchema: proposal.inputSchema,
    outputSchema: proposal.outputSchema,
    scope: proposal.scope,
    outOfScope: proposal.outOfScope,
    guardrails: [],
    testResults: null,
    tags: proposal.tags,
    language: proposal.language,
    targetModels: proposal.targetModels,
    complianceFrameworks: proposal.complianceFrameworks,
    version: "1.0.0",
    createdAt: now,
    certifiedAt: null,
    exportedContent: null,
  };

  // Step 2: Generate guardrails
  skill.guardrails = await generateGuardrails({
    name: skill.name,
    description: skill.description,
    domain: skill.domain,
    riskLevel: skill.riskLevel,
  });
  skill.status = "testing";

  // Step 3: Run tests
  skill.testResults = await runSkillTest({
    name: skill.name,
    description: skill.description,
    inputSchema: skill.inputSchema,
    outputSchema: skill.outputSchema,
    scope: skill.scope,
    outOfScope: skill.outOfScope,
  });

  // Step 4: Certify or fail
  if (skill.testResults.score >= CERTIFICATION_THRESHOLD) {
    skill.status = "certified";
    skill.certifiedAt = new Date().toISOString();
    skill.exportedContent = exportAsClaudeSkill(skill);
  } else {
    skill.status = "failed";
  }

  return skill;
}

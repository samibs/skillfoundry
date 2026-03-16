// ── Embedding Service types (Epic 6: Semantic Memory System) ─────────────────

/**
 * The result of embedding a single text.
 */
export interface EmbeddingResult {
  /** Dense vector representation of the text. */
  vector: number[];
  /** Name of the provider that produced this embedding ('ollama' | 'openai'). */
  provider: string;
  /** Dimensionality of the vector (768 for Ollama, 1536 for OpenAI). */
  dimensions: number;
  /** True when the result was served from the in-memory LRU cache. */
  cached: boolean;
}

/**
 * Configuration options for EmbeddingService.
 */
export interface EmbeddingServiceOptions {
  /** Preferred provider to try first. Default: 'ollama'. */
  preferredProvider: 'ollama' | 'openai';
  /** Base URL for the Ollama API. Default: 'http://localhost:11434'. */
  ollamaUrl: string;
  /** Ollama embedding model name. Default: 'nomic-embed-text'. */
  ollamaModel: string;
  /** OpenAI API key. Reads SF_OPENAI_API_KEY from env when not provided. */
  openaiApiKey?: string;
  /** OpenAI embedding model name. Default: 'text-embedding-3-small'. */
  openaiModel: string;
  /** Maximum text length in characters before truncation. Default: 8192. */
  maxChunkLength: number;
  /** LRU cache TTL in milliseconds. Default: 3600000 (1 hour). */
  cacheTtlMs: number;
  /** Maximum number of entries in the LRU cache. Default: 500. */
  maxCacheSize: number;
}

/**
 * Provider abstraction for embedding backends.
 */
export interface EmbeddingProvider {
  /** Provider identifier ('ollama' | 'openai'). */
  name: string;
  /** Vector dimensionality produced by this provider. */
  dimensions: number;
  /**
   * Embed a single text string.
   * @param text - The text to embed.
   * @returns Dense vector as an array of floats.
   */
  embed(text: string): Promise<number[]>;
  /**
   * Embed multiple texts in batches.
   * @param texts - Array of texts to embed.
   * @param batchSize - Number of texts per batch request.
   * @returns Array of dense vectors in the same order as the input.
   */
  embedBatch(texts: string[], batchSize?: number): Promise<number[][]>;
  /**
   * Check whether the provider is reachable and ready.
   * @returns True when the provider can accept embedding requests.
   */
  isAvailable(): Promise<boolean>;
}

// Session states matching existing .claude/state.json schema
export type SessionState =
  | 'IDLE'
  | 'GENERATING_STORIES'
  | 'VALIDATED'
  | 'EXECUTING_STORY'
  | 'COMPLETED'
  | 'FAILED';

// Message roles in the conversation
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  metadata?: {
    provider?: string;
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
    thinkingContent?: string;
    mode?: 'chat' | 'agent' | 'pipeline';
    activeAgent?: string;
    fallbackUsed?: string;
    routedAgent?: string;
    routingConfidence?: string;
    activeTeam?: string;
  };
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  output: string;
  isError: boolean;
}

// Config schema matching existing .skillfoundry/config.toml
export interface SfConfig {
  provider: string;
  engine: string;
  model: string;
  fallback_provider: string;
  fallback_engine: string;
  monthly_budget_usd: number;
  run_budget_usd: number;
  memory_sync_enabled: boolean;
  memory_sync_remote: string;
  // Local-first development (v2.0.12)
  route_local_first: boolean;
  local_provider: string;
  local_model: string;
  context_window: number; // 0 = auto-detect from model
  log_level: string; // debug | info | warn | error
  // Team config file reference (v2.0.55)
  team_config?: string;
}

// ── Team Configuration (Epic 9: Team & Cloud Mode) ────────────────────────────

/** Gate threshold overrides per tier */
export interface GateThresholds {
  /** Minimum correctness contract coverage (0-100). Default 50 */
  t0_min_coverage?: number;
  /** T1 banned patterns: 'strict' (zero tolerance) or 'warn' (report only). Default 'strict' */
  t1_mode?: 'strict' | 'warn';
  /** T3 minimum test file count. Default 1 */
  t3_min_test_files?: number;
  /** T4 security: fail on 'critical', 'high', or 'medium'. Default 'high' */
  t4_fail_severity?: 'critical' | 'high' | 'medium';
  /** T5 build: required or optional. Default 'required' */
  t5_build?: 'required' | 'optional';
}

/** Shared memory bank configuration */
export interface TeamMemoryConfig {
  /** Git remote URL for shared memory */
  remote: string;
  /** Branch name. Default 'main' */
  branch?: string;
  /** Auto-sync on pipeline start. Default false */
  auto_sync?: boolean;
}

/** Version-pinned skill references */
export interface SkillPinConfig {
  /** Pinned version string (semver). e.g., '2.0.55' */
  version: string;
  /** Lock file path for integrity check */
  lock_file?: string;
}

/** Organization-wide team configuration */
export interface TeamConfig {
  /** Config schema version (semver) */
  version: string;
  /** Organization name (1-100 chars) */
  org: string;
  /** Per-tier gate threshold overrides */
  gates?: GateThresholds;
  /** Additional banned patterns beyond defaults */
  banned_patterns?: string[];
  /** Allowed AI model identifiers */
  approved_models?: string[];
  /** Shared memory bank configuration */
  memory?: TeamMemoryConfig;
  /** Version-pinned skill references */
  skills?: SkillPinConfig;
}

/** Single entry in the append-only audit log */
export interface AuditEntry {
  /** Unique entry identifier (UUID v4) */
  id: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** User or CI identity (1-200 chars) */
  actor: string;
  /** Gate tier name (T0-T6, MG0, etc.) */
  gate: string;
  /** Gate result */
  verdict: 'pass' | 'fail' | 'warn' | 'skip';
  /** Human-readable explanation (1-2000 chars) */
  reason: string;
  /** Gate execution time in milliseconds */
  duration_ms: number;
  /** Story file being evaluated (optional) */
  story_file?: string;
  /** SHA256 of primary file evaluated (optional) */
  file_sha?: string;
}

/** SHA256-keyed gate cache entry */
export interface GateCacheEntry {
  /** SHA256 hash of the file contents */
  file_sha256: string;
  /** Which gate tier produced this result */
  gate: string;
  /** Cached verdict */
  verdict: 'pass' | 'fail' | 'warn';
  /** Cached reason */
  reason: string;
  /** ISO 8601 when cached */
  cached_at: string;
  /** ISO 8601 cache expiry */
  expires_at: string;
}

// Policy schema matching existing .skillfoundry/policy.toml
export interface SfPolicy {
  allow_shell: boolean;
  allow_network: boolean;
  allow_paths: string[];
  redact: boolean;
}

// State schema matching existing .claude/state.json
export interface SfState {
  current_state: SessionState;
  updated_at: string;
  current_prd: string;
  current_story: string;
  last_plan_id: string;
  last_run_id: string;
  recovery: {
    rollback_available: boolean;
    resume_point: string;
  };
}

// Permission mode for tool execution
export type PermissionMode = 'auto' | 'ask' | 'deny' | 'trusted';

// Slash command definition
export interface SlashCommand {
  name: string;
  description: string;
  usage: string;
  execute: (args: string, session: SessionContext) => Promise<string | void>;
}

// Team definition for multi-agent routing (imported from team-registry at runtime)
export interface TeamDefinitionRef {
  name: string;
  displayName: string;
  description: string;
  members: string[];
  defaultAgent: string;
}

// Session context passed to commands and hooks
export interface SessionContext {
  config: SfConfig;
  policy: SfPolicy;
  state: SfState;
  messages: Message[];
  permissionMode: PermissionMode;
  workDir: string;
  activeAgent: string | null;
  activeTeam: TeamDefinitionRef | null;
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => void;
  setState: (state: Partial<SfState>) => void;
  setActiveAgent: (name: string | null) => void;
  setActiveTeam: (team: TeamDefinitionRef | null) => void;
}

// Provider streaming callback
export type StreamCallback = (chunk: string, done: boolean) => void;

// Callback for when the provider returns tool_use blocks
export type ToolUseCallback = (toolCalls: ToolCall[]) => void;

// Anthropic API content block types
export interface ContentBlockText {
  type: 'text';
  text: string;
}

export interface ContentBlockToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type ContentBlock = ContentBlockText | ContentBlockToolUse;

// Provider adapter interface
export interface ProviderAdapter {
  name: string;
  stream(
    messages: Array<{ role: string; content: string }>,
    options: { model: string; maxTokens?: number; systemPrompt?: string },
    onChunk: StreamCallback,
  ): Promise<{
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    thinkingContent?: string;
  }>;

  // Agentic stream: sends messages with tool definitions, returns content blocks
  streamWithTools(
    messages: Array<AnthropicMessage>,
    options: {
      model: string;
      maxTokens?: number;
      systemPrompt?: string;
      tools: Array<{ name: string; description: string; input_schema: unknown }>;
    },
    onChunk: StreamCallback,
  ): Promise<{
    content: ContentBlock[];
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    stopReason: string;
    thinkingContent?: string;
  }>;
}

// Anthropic message format for multi-turn tool conversations
export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

export interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

// Active tool execution state (for UI rendering)
export interface ActiveToolExecution {
  toolCall: ToolCall;
  result?: ToolResult;
  isExecuting: boolean;
  permissionPending: boolean;
}

// ── AI Runner types (standalone agentic loop) ──────────────────────

export interface RunnerCallbacks {
  onStreamChunk?: (chunk: string) => void;
  onToolStart?: (toolCall: ToolCall) => void;
  onToolComplete?: (toolCall: ToolCall, result: ToolResult) => void;
  onTurnComplete?: (turn: number, tokens: { input: number; output: number; cost: number }) => void;
  requestPermission?: (toolCall: ToolCall, reason: string) => Promise<'allow' | 'deny'>;
}

export interface RunnerOptions {
  config: SfConfig;
  policy: SfPolicy;
  systemPrompt?: string;
  tools?: Array<{ name: string; description: string; input_schema: unknown }>;
  maxTurns?: number;
  workDir?: string;
  abortSignal?: { aborted: boolean };
}

export interface RunnerResult {
  content: string;
  turnCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  aborted: boolean;
}

// ── Micro-gate types (post-handoff AI review checks) ────────────

export type MicroGateVerdict = 'PASS' | 'FAIL' | 'WARN';

export interface MicroGateFinding {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  description: string;
  location?: string;  // file:line
}

export interface MicroGateResult {
  gate: string;       // 'MG0' | 'MG1' | 'MG1.5' | 'MG2' | 'MG3'
  agent: string;      // 'ac-validator' | 'security' | 'test-docs' | 'standards' | 'review'
  verdict: MicroGateVerdict;
  findings: MicroGateFinding[];
  summary: string;
  costUsd: number;
  turnCount: number;
  durationMs: number;
  skippedDueToError?: boolean;  // true when provider error prevented actual review
}

// ── Agent Message Bus types ────────────────────────────────────────

/**
 * Discriminated union of all message types supported by the AgentMessageBus.
 * task: messages carry work delegation and cancellation signals.
 * result: messages carry outcomes from agent execution.
 * status: messages carry heartbeat and status-poll signals.
 * memory: messages carry knowledge store/query operations.
 */
export type MessageType =
  | 'task:delegate'
  | 'task:cancel'
  | 'result:complete'
  | 'result:error'
  | 'status:heartbeat'
  | 'status:request'
  | 'memory:store'
  | 'memory:query';

/**
 * Typed message envelope used by every publish/subscribe interaction on the bus.
 * @template T - Shape of the payload. Defaults to Record<string, unknown>.
 */
export interface AgentMessage<T = Record<string, unknown>> {
  /** UUID v4 — unique identifier for this message instance. */
  id: string;
  /** ID of the agent (or system component) that sent the message. */
  sender: string;
  /** ID of the target agent, or '*' for a broadcast to all subscribers of that type. */
  recipient: string;
  /** The message classification used for topic-based routing. */
  type: MessageType;
  /** Arbitrary structured data specific to this message type. */
  payload: T;
  /** Shared identifier that links a request message to its response(s). */
  correlationId: string;
  /** Unix milliseconds — Date.now() at the moment of publish. */
  timestamp: number;
}

// ── Finisher types (post-pipeline mechanical housekeeping) ──────────

export type FinisherCheckStatus = 'ok' | 'drift' | 'missing' | 'error';

export interface FinisherCheckResult {
  check: string;         // 'version' | 'test-count' | 'architecture' | 'changelog' | 'git-clean'
  status: FinisherCheckStatus;
  detail: string;
  fixed: boolean;
  durationMs: number;
}

export interface FinisherSummary {
  checks: FinisherCheckResult[];
  totalChecks: number;
  drifted: number;
  fixed: number;
  ok: number;
  errors: number;
  durationMs: number;
  newVersion?: string;
}

// ── Pipeline types (forge execution engine) ────────────────────────

export type PipelinePhaseStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

export interface PipelinePhase {
  name: string;
  status: PipelinePhaseStatus;
  durationMs: number;
  detail?: string;
}

export interface PipelineCallbacks {
  onPhaseStart?: (phase: string, detail?: string) => void;
  onPhaseComplete?: (phase: string, status: PipelinePhaseStatus) => void;
  onStoryStart?: (story: string, index: number, total: number) => void;
  onStoryComplete?: (story: string, passed: boolean, cost: number) => void;
  onGateResult?: (tier: string, status: string, detail?: string) => void;
  onMicroGateResult?: (result: MicroGateResult) => void;
  onFinisherCheck?: (result: FinisherCheckResult) => void;
  requestPermission?: (toolCall: ToolCall, reason: string) => Promise<'allow' | 'deny'>;
}

export interface PipelineOptions {
  config: SfConfig;
  policy: SfPolicy;
  workDir: string;
  prdFilter?: string;
  callbacks?: PipelineCallbacks;
  /** When true, skips PRD semantic quality scoring (--skip-prd-review flag). */
  skipPrdReview?: boolean;
}

export interface StoryExecution {
  storyFile: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  turnCount: number;
  costUsd: number;
  fixerAttempts: number;
  microGateResults?: MicroGateResult[];
  testsMissing?: boolean;
}

export interface PipelineResult {
  runId: string;
  phases: PipelinePhase[];
  storiesTotal: number;
  storiesCompleted: number;
  storiesFailed: number;
  gateVerdict: string;
  totalCostUsd: number;
  totalTokens: { input: number; output: number };
  durationMs: number;
  microGateSummary?: {
    totalRun: number;
    totalPassed: number;
    totalFailed: number;
    totalWarned: number;
    totalCostUsd: number;
    preTemperAdvisory?: MicroGateResult;
  };
  finisherSummary?: FinisherSummary;
  sessionReport?: {
    issues: number;
    blockers: number;
    anomalies: number;
    reportPath: string;
  };
}

// ── Checkov IaC scanning types (STORY-010) ───────────────────────────────────

/**
 * A single IaC misconfiguration finding from Checkov.
 */
export interface CheckovFinding {
  /** Checkov check ID, e.g. "CKV_DOCKER_2". */
  checkId: string;
  /** Human-readable check name. */
  checkName: string;
  /** Normalised severity derived from Checkov check metadata. */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Relative file path within the scanned target. */
  file: string;
  /** Line number of the misconfiguration. */
  line: number;
  /** IaC framework: 'dockerfile' | 'terraform' | 'cloudformation' | 'kubernetes' | 'arm' | string */
  framework: string;
  /** URL to the Checkov remediation documentation. */
  guideline: string;
  /** Check outcome. */
  status: 'failed' | 'passed' | 'skipped';
}

/**
 * Aggregated result of a Checkov scan run.
 */
export interface CheckovScanResult {
  scanner: 'checkov';
  available: boolean;
  success: boolean;
  findings: CheckovFinding[];
  findingCount: number;
  passedCount: number;
  scannedFiles: number;
  frameworks: string[];
  duration: number;
  skipped: boolean;
  skipReason?: string;
}

// ── License compliance types (STORY-010) ─────────────────────────────────────

/**
 * A single license compliance finding.
 */
export interface LicenseFinding {
  /** Package name. */
  package: string;
  /** Package version string. */
  version: string;
  /** SPDX license identifier, or "UNKNOWN" when not determinable. */
  license: string;
  /** Manifest file where the dependency was declared. */
  source: string;
  /** high = copyleft in commercial project; medium = unknown license. */
  severity: 'high' | 'medium';
  /** Human-readable reason for the finding. */
  reason: string;
}

/**
 * Aggregated result of a license compliance check.
 */
export interface LicenseCheckResult {
  scanner: 'license';
  findings: LicenseFinding[];
  findingCount: number;
  checkedPackages: number;
  manifests: string[];
  projectType: string;
  duration: number;
}

// ── Gitleaks secrets scanning types (STORY-009) ──────────────────────────────

/**
 * A single secret finding from Gitleaks output.
 * Raw secret values are never stored — only a SHA-256 hash for deduplication.
 */
export interface GitleaksFinding {
  /** Human-readable rule description, e.g. "AWS Access Key". */
  description: string;
  /** Relative file path within the scanned target. */
  file: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  /**
   * Redacted representation of the matched secret.
   * Format: first 4 chars + asterisks + last 4 chars.
   * Never contains the actual secret.
   */
  match: string;
  /**
   * SHA-256 hash of the secret value — for deduplication only.
   * The raw secret is never stored in any data structure.
   */
  secretHash: string;
  /** Rule ID, e.g. "aws-access-key-id". */
  rule: string;
  /** Shannon entropy of the matched string. */
  entropy: number;
  /** Unique finding fingerprint for .gitleaksignore suppression. */
  fingerprint: string;
  /** True when the fingerprint is listed in .gitleaksignore. */
  suppressed: boolean;
}

// ── PRD Quality Scorer types (STORY-012) ─────────────────────────────────────

/**
 * Per-dimension evaluation result from the LLM PRD scorer.
 */
export interface PrdDimensionScore {
  /** Integer score from 1 (worst) to 10 (best). */
  score: number;
  /** 2-3 sentence justification explaining why this score was assigned. */
  justification: string;
}

/**
 * Full scoring result returned by scorePrd().
 * pass is true when ALL four dimension scores are >= 6.
 */
export interface PrdScore {
  /** Absolute path to the PRD file that was scored. */
  prdPath: string;
  /** Completeness: all required sections present and meaningfully filled. */
  completeness: PrdDimensionScore;
  /** Specificity: concrete, measurable, unambiguous language throughout. */
  specificity: PrdDimensionScore;
  /** Consistency: no contradictions between sections. */
  consistency: PrdDimensionScore;
  /** Scope: clear boundaries with explicit exclusions. */
  scope: PrdDimensionScore;
  /** Actionable improvement suggestions (2-5 items for low-scoring dimensions). */
  suggestions: string[];
  /** True when all four dimension scores are >= 6. */
  pass: boolean;
  /** ISO timestamp of when this score was produced. */
  scoredAt: string;
  /** Whether the result was served from the in-memory cache. */
  cached: boolean;
}

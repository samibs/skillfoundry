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
}

export interface StoryExecution {
  storyFile: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  turnCount: number;
  costUsd: number;
  fixerAttempts: number;
  microGateResults?: MicroGateResult[];
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
}

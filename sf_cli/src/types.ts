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

// Session context passed to commands and hooks
export interface SessionContext {
  config: SfConfig;
  policy: SfPolicy;
  state: SfState;
  messages: Message[];
  permissionMode: PermissionMode;
  workDir: string;
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => void;
  setState: (state: Partial<SfState>) => void;
}

// Provider streaming callback
export type StreamCallback = (chunk: string, done: boolean) => void;

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
}

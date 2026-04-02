export type StreamEventType =
  | "message_start"
  | "tool_match"
  | "message_delta"
  | "message_stop"
  | "permission_denial";

export interface StreamEvent {
  type: StreamEventType;
  sessionId: string;
  timestamp: string;
  toolName?: string;
  tier?: string;
  category?: string;
  text?: string;
  progress?: number;
  usage?: { inputTokens: number; outputTokens: number };
  stopReason?: string;
  reason?: string;
}

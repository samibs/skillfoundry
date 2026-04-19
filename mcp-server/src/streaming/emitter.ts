import type { Response } from "express";
import type { StreamEvent, StreamEventType } from "./protocol.js";

export class StreamEmitter {
  private clients: Set<Response> = new Set();

  addClient(res: Response): void {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    this.clients.add(res);

    res.on("close", () => {
      this.clients.delete(res);
    });
  }

  emit(event: StreamEvent): void {
    const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const client of this.clients) {
      client.write(payload);
    }
  }

  emitStart(sessionId: string, toolName: string): void {
    this.emit({
      type: "message_start",
      sessionId,
      timestamp: new Date().toISOString(),
      toolName,
    });
  }

  emitMatch(
    sessionId: string,
    toolName: string,
    tier: string,
    category: string
  ): void {
    this.emit({
      type: "tool_match",
      sessionId,
      timestamp: new Date().toISOString(),
      toolName,
      tier,
      category,
    });
  }

  emitDelta(sessionId: string, text: string, progress?: number): void {
    this.emit({
      type: "message_delta",
      sessionId,
      timestamp: new Date().toISOString(),
      text,
      progress,
    });
  }

  emitStop(
    sessionId: string,
    usage: { inputTokens: number; outputTokens: number },
    stopReason: string
  ): void {
    this.emit({
      type: "message_stop",
      sessionId,
      timestamp: new Date().toISOString(),
      usage,
      stopReason,
    });
  }

  emitDenial(sessionId: string, toolName: string, reason: string): void {
    this.emit({
      type: "permission_denial",
      sessionId,
      timestamp: new Date().toISOString(),
      toolName,
      reason,
    });
  }

  clientCount(): number {
    return this.clients.size;
  }
}

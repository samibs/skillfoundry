/**
 * Chrome DevTools Protocol (CDP) adapter for debugging external Node.js/Bun processes.
 *
 * Connects to a target process started with `node --inspect-brk=0 <file>` via
 * WebSocket, sends CDP commands, and handles debugger events.
 *
 * WebSocket strategy: uses a minimal text-frame-only WS client built on
 * `node:http` + `node:net` for Node 20 compatibility (no dependency on the
 * global WebSocket constructor introduced in Node 21).
 */

import * as http from "node:http";
import * as crypto from "node:crypto";
import { EventEmitter } from "node:events";
import type { Socket } from "node:net";

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface CDPBreakpoint {
  id: string;
  file: string;
  line: number;
  condition?: string;
  verified: boolean;
}

export interface CDPPauseLocation {
  file: string;
  line: number;
  column: number;
  functionName: string;
}

export interface CDPVariable {
  name: string;
  type: string;
  value: unknown;
  preview?: string;
}

export interface CDPStackFrame {
  id: string;
  functionName: string;
  file: string;
  line: number;
  column: number;
}

// ---------------------------------------------------------------------------
// Minimal text-frame WebSocket client (Node 20 compatible)
// ---------------------------------------------------------------------------

/**
 * A bare-bones WebSocket client that supports only text frames — sufficient
 * for the JSON-based CDP protocol.  Binary frames, extensions, and
 * compression are intentionally unsupported.
 */
class MinimalWebSocket extends EventEmitter {
  private socket: Socket | null = null;
  private buffer = Buffer.alloc(0);
  private closed = false;

  /** Perform the HTTP upgrade handshake and resolve when the connection is open. */
  static create(url: string): Promise<MinimalWebSocket> {
    return new Promise<MinimalWebSocket>((resolve, reject) => {
      const parsed = new URL(url);
      const key = crypto.randomBytes(16).toString("base64");

      const req = http.get(
        {
          hostname: parsed.hostname,
          port: Number(parsed.port) || 80,
          path: parsed.pathname + parsed.search,
          headers: {
            Connection: "Upgrade",
            Upgrade: "websocket",
            "Sec-WebSocket-Key": key,
            "Sec-WebSocket-Version": "13",
          },
        },
        () => {
          /* should not receive a normal response */
          reject(new Error("CDP WebSocket: unexpected HTTP response instead of upgrade"));
        },
      );

      req.on("error", reject);

      req.on("upgrade", (_res, socket, head) => {
        const ws = new MinimalWebSocket();
        ws.socket = socket;
        if (head.length > 0) {
          ws.buffer = Buffer.from(head);
        }
        socket.on("data", (chunk: Buffer) => ws.onData(chunk));
        socket.on("close", () => ws.handleClose());
        socket.on("error", (err) => ws.emit("error", err));
        resolve(ws);
      });
    });
  }

  /** Send a text frame (opcode 0x01) with a 4-byte masking key. */
  send(data: string): void {
    if (this.closed || !this.socket) {
      throw new Error("CDP WebSocket: cannot send on a closed connection");
    }
    const payload = Buffer.from(data, "utf-8");
    const mask = crypto.randomBytes(4);
    const masked = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i++) {
      masked[i] = payload[i]! ^ mask[i % 4]!;
    }

    let header: Buffer;
    if (payload.length < 126) {
      header = Buffer.alloc(6);
      header[0] = 0x81; // FIN + text opcode
      header[1] = 0x80 | payload.length; // MASK bit + length
      mask.copy(header, 2);
    } else if (payload.length < 65536) {
      header = Buffer.alloc(8);
      header[0] = 0x81;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(payload.length, 2);
      mask.copy(header, 4);
    } else {
      header = Buffer.alloc(14);
      header[0] = 0x81;
      header[1] = 0x80 | 127;
      // Write 64-bit length (upper 32 bits are 0 for any realistic CDP message)
      header.writeUInt32BE(0, 2);
      header.writeUInt32BE(payload.length, 6);
      mask.copy(header, 10);
    }
    this.socket.write(Buffer.concat([header, masked]));
  }

  /** Send a close frame and tear down the socket. */
  close(): void {
    if (this.closed || !this.socket) return;
    this.closed = true;
    // Send close frame (opcode 0x08) with mask
    const mask = crypto.randomBytes(4);
    const frame = Buffer.alloc(6);
    frame[0] = 0x88; // FIN + close
    frame[1] = 0x80; // MASK, 0 length
    mask.copy(frame, 2);
    this.socket.write(frame);
    this.socket.end();
  }

  get isClosed(): boolean {
    return this.closed;
  }

  // -- internal frame parser ------------------------------------------------

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.drainFrames();
  }

  private drainFrames(): void {
    while (this.buffer.length >= 2) {
      const firstByte = this.buffer[0]!;
      const secondByte = this.buffer[1]!;
      const opcode = firstByte & 0x0f;
      const isMasked = (secondByte & 0x80) !== 0; // server frames should NOT be masked
      let payloadLen = secondByte & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (this.buffer.length < 4) return; // need more data
        payloadLen = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (this.buffer.length < 10) return;
        // Read only the lower 32 bits — sufficient for CDP
        payloadLen = this.buffer.readUInt32BE(6);
        offset = 10;
      }

      let maskKey: Buffer | null = null;
      if (isMasked) {
        if (this.buffer.length < offset + 4) return;
        maskKey = this.buffer.subarray(offset, offset + 4);
        offset += 4;
      }

      if (this.buffer.length < offset + payloadLen) return; // incomplete payload

      let payload = this.buffer.subarray(offset, offset + payloadLen);
      if (maskKey) {
        const unmasked = Buffer.alloc(payload.length);
        for (let i = 0; i < payload.length; i++) {
          unmasked[i] = payload[i]! ^ maskKey[i % 4]!;
        }
        payload = unmasked;
      }

      this.buffer = this.buffer.subarray(offset + payloadLen);

      if (opcode === 0x01) {
        // Text frame
        this.emit("message", payload.toString("utf-8"));
      } else if (opcode === 0x08) {
        // Close frame
        this.handleClose();
        return;
      } else if (opcode === 0x09) {
        // Ping — reply with pong (opcode 0x0a)
        this.sendControlFrame(0x0a, payload);
      }
      // Ignore pong (0x0a) and continuation (0x00) frames
    }
  }

  private sendControlFrame(opcode: number, payload: Buffer): void {
    if (this.closed || !this.socket) return;
    const mask = crypto.randomBytes(4);
    const masked = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i++) {
      masked[i] = payload[i]! ^ mask[i % 4]!;
    }
    const frame = Buffer.alloc(2 + 4 + payload.length);
    frame[0] = 0x80 | opcode; // FIN + opcode
    frame[1] = 0x80 | payload.length;
    mask.copy(frame, 2);
    masked.copy(frame, 6);
    this.socket.write(frame);
  }

  private handleClose(): void {
    if (this.closed) return;
    this.closed = true;
    this.socket?.destroy();
    this.emit("close");
  }
}

// ---------------------------------------------------------------------------
// CDP Adapter
// ---------------------------------------------------------------------------

/** Maximum preview length for variable values (bytes). */
const VALUE_PREVIEW_LIMIT = 2048;

export class CDPAdapter {
  private ws: MinimalWebSocket | null = null;
  private msgId = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private paused = false;
  private pauseLocation: CDPPauseLocation | null = null;
  private callFrames: any[] = [];
  private scriptMap = new Map<string, string>(); // scriptId → url
  private connected = false;

  // -----------------------------------------------------------------------
  // Connection
  // -----------------------------------------------------------------------

  /** Connect to a CDP endpoint via WebSocket. Only localhost connections allowed. */
  async connect(wsUrl: string): Promise<void> {
    if (this.ws && !this.ws.isClosed) {
      throw new Error("CDPAdapter: already connected — disconnect first");
    }

    // Security: only allow connections to localhost (prevents exfiltration)
    const parsed = new URL(wsUrl);
    if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost' && parsed.hostname !== '::1') {
      throw new Error(`CDPAdapter: connection only allowed to localhost, got ${parsed.hostname}`);
    }

    const ws = await MinimalWebSocket.create(wsUrl);
    this.ws = ws;
    this.connected = true;
    this.paused = false;
    this.pauseLocation = null;
    this.callFrames = [];
    this.scriptMap.clear();
    this.pending.clear();
    this.msgId = 0;

    ws.on("message", (raw: string) => this.onMessage(raw));
    ws.on("close", () => this.onClose());
    ws.on("error", (err: Error) => this.onError(err));
  }

  /** Close the CDP connection (alias for disconnect). */
  close(): void {
    if (!this.ws) return;
    for (const [, p] of this.pending) {
      p.reject(new Error('CDPAdapter: disconnected'));
    }
    this.pending.clear();
    this.ws.close();
    this.ws = null;
    this.connected = false;
    this.paused = false;
    this.pauseLocation = null;
    this.callFrames = [];
  }

  /** Gracefully disconnect from the debuggee. */
  async disconnect(): Promise<void> {
    if (!this.ws) return;
    // Reject all pending calls
    for (const [, p] of this.pending) {
      p.reject(new Error("CDPAdapter: disconnected"));
    }
    this.pending.clear();
    this.ws.close();
    this.ws = null;
    this.connected = false;
    this.paused = false;
    this.pauseLocation = null;
    this.callFrames = [];
  }

  // -----------------------------------------------------------------------
  // Debugger domain
  // -----------------------------------------------------------------------

  /** Enable the Debugger and Runtime domains. */
  async enableDebugger(): Promise<void> {
    await this.send("Runtime.enable", {});
    await this.send("Debugger.enable", { maxScriptsCacheSize: 10_000_000 });
  }

  /** Set a breakpoint by file path and 0-based line number. */
  async setBreakpoint(file: string, line: number, condition?: string): Promise<CDPBreakpoint> {
    // Escape regex-special characters in the file path so urlRegex matches literally.
    const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const params: Record<string, unknown> = {
      lineNumber: line,
      urlRegex: escaped,
    };
    if (condition) {
      params.condition = condition;
    }
    const result = await this.send("Debugger.setBreakpointByUrl", params);
    const locations: any[] = result.locations ?? [];
    const verified = locations.length > 0;
    return {
      id: result.breakpointId as string,
      file,
      line: verified ? (locations[0].lineNumber as number) : line,
      condition,
      verified,
    };
  }

  /** Remove a breakpoint by its CDP breakpoint ID. */
  async removeBreakpoint(breakpointId: string): Promise<void> {
    await this.send("Debugger.removeBreakpoint", { breakpointId });
  }

  /** Resume execution. */
  async resume(): Promise<void> {
    this.paused = false;
    this.pauseLocation = null;
    await this.send("Debugger.resume", {});
  }

  /** Step over the current statement and wait for the next pause. */
  async stepOver(): Promise<CDPPauseLocation> {
    return this.stepAndWait("Debugger.stepOver");
  }

  /** Step into the current call and wait for the next pause. */
  async stepInto(): Promise<CDPPauseLocation> {
    return this.stepAndWait("Debugger.stepInto");
  }

  /** Step out of the current function and wait for the next pause. */
  async stepOut(): Promise<CDPPauseLocation> {
    return this.stepAndWait("Debugger.stepOut");
  }

  /** Pause execution immediately. */
  async pause(): Promise<void> {
    await this.send("Debugger.pause", {});
  }

  // -----------------------------------------------------------------------
  // Runtime domain
  // -----------------------------------------------------------------------

  /**
   * Evaluate an expression in the context of the current paused call frame.
   * If not paused, evaluates in the global scope.
   */
  async evaluate(expression: string): Promise<{ type: string; value: unknown; preview?: string }> {
    const params: Record<string, unknown> = {
      expression,
      generatePreview: true,
      returnByValue: false,
    };
    if (this.paused && this.callFrames.length > 0) {
      params.callFrameId = this.callFrames[0].callFrameId;
      // Use Debugger.evaluateOnCallFrame instead of Runtime.evaluate when paused
      const result = await this.send("Debugger.evaluateOnCallFrame", params);
      return this.formatRemoteObject(result.result);
    }
    const result = await this.send("Runtime.evaluate", params);
    return this.formatRemoteObject(result.result);
  }

  /**
   * Return variables visible in the top call frame's scope chain.
   * Only available when paused.
   */
  async getScope(): Promise<CDPVariable[]> {
    this.ensurePaused();
    const topFrame = this.callFrames[0];
    if (!topFrame) return [];

    const variables: CDPVariable[] = [];
    const scopes: any[] = topFrame.scopeChain ?? [];

    for (const scope of scopes) {
      // Skip global scope — too noisy
      if (scope.type === "global") continue;

      const objectId = scope.object?.objectId;
      if (!objectId) continue;

      const propsResult = await this.send("Runtime.getProperties", {
        objectId,
        ownProperties: true,
        generatePreview: true,
      });

      for (const prop of propsResult.result ?? []) {
        if (prop.name === "__proto__") continue;
        const v = prop.value;
        if (!v) continue;
        variables.push({
          name: prop.name,
          type: v.type ?? "undefined",
          value: v.value,
          preview: this.formatVariablePreview(v),
        });
      }
    }
    return variables;
  }

  /** Return the current call stack. Only available when paused. */
  async getCallStack(): Promise<CDPStackFrame[]> {
    this.ensurePaused();
    return this.callFrames.map((f) => ({
      id: f.callFrameId as string,
      functionName: (f.functionName as string) || "(anonymous)",
      file: this.resolveScriptUrl(f.location?.scriptId) ?? "<unknown>",
      line: (f.location?.lineNumber as number) ?? 0,
      column: (f.location?.columnNumber as number) ?? 0,
    }));
  }

  // -----------------------------------------------------------------------
  // State accessors
  // -----------------------------------------------------------------------

  getPauseLocation(): CDPPauseLocation | null {
    return this.pauseLocation;
  }

  isPaused(): boolean {
    return this.paused;
  }

  isConnected(): boolean {
    return this.connected;
  }

  // -----------------------------------------------------------------------
  // Internals — CDP transport
  // -----------------------------------------------------------------------

  /**
   * Send a CDP method call and wait for the matching response.
   * Rejects if the response contains an `error` field or if the
   * connection drops before a response arrives.
   */
  /** Build a short preview string from a CDP RemoteObject (for scope variables). */
  private formatVariablePreview(obj: any): string | undefined {
    if (!obj) return undefined;
    if (obj.preview) return this.stringifyPreview(obj.preview);
    if (obj.type === 'string' && typeof obj.value === 'string') {
      return obj.value.length > VALUE_PREVIEW_LIMIT
        ? obj.value.slice(0, VALUE_PREVIEW_LIMIT) + '…'
        : obj.value;
    }
    if (obj.description) return String(obj.description).slice(0, VALUE_PREVIEW_LIMIT);
    return undefined;
  }

  /**
   * Send a CDP method call and wait for the matching response.
   * Rejects if the response contains an `error` field or if the
   * connection drops before a response arrives.
   */
  send(method: string, params: Record<string, unknown>): Promise<any> {
    if (!this.ws || this.ws.isClosed) {
      return Promise.reject(new Error(`CDPAdapter: not connected (calling ${method})`));
    }
    const id = ++this.msgId;
    const msg = JSON.stringify({ id, method, params });
    return new Promise<any>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws!.send(msg);
    });
  }

  /** Dispatch an incoming CDP message (response or event). */
  private onMessage(raw: string): void {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return; // Malformed JSON — skip
    }

    // Response to a pending call
    if (typeof msg.id === "number") {
      const p = this.pending.get(msg.id);
      if (p) {
        this.pending.delete(msg.id);
        if (msg.error) {
          p.reject(new Error(`CDP error [${msg.error.code}]: ${msg.error.message}`));
        } else {
          p.resolve(msg.result ?? {});
        }
      }
      return;
    }

    // Event
    this.handleEvent(msg.method as string, msg.params ?? {});
  }

  /** Handle CDP events. */
  private handleEvent(method: string, params: any): void {
    switch (method) {
      case "Debugger.paused": {
        this.paused = true;
        this.callFrames = params.callFrames ?? [];
        const top = this.callFrames[0];
        if (top?.location) {
          this.pauseLocation = {
            file: this.resolveScriptUrl(top.location.scriptId) ?? "<unknown>",
            line: top.location.lineNumber ?? 0,
            column: top.location.columnNumber ?? 0,
            functionName: top.functionName || "(anonymous)",
          };
        }
        break;
      }
      case "Debugger.resumed": {
        this.paused = false;
        this.pauseLocation = null;
        this.callFrames = [];
        break;
      }
      case "Debugger.scriptParsed": {
        const id = params.scriptId as string;
        const url = (params.url as string) || "";
        if (id && url) {
          this.scriptMap.set(id, url);
        }
        break;
      }
    }
  }

  private onClose(): void {
    this.connected = false;
    this.ws = null;
    for (const [, p] of this.pending) {
      p.reject(new Error("CDPAdapter: WebSocket closed unexpectedly"));
    }
    this.pending.clear();
  }

  private onError(err: Error): void {
    // Reject all pending with the error, then mark disconnected
    for (const [, p] of this.pending) {
      p.reject(err);
    }
    this.pending.clear();
    this.connected = false;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Issue a step command, then wait for the next `Debugger.paused` event
   * by polling internal state (the event is processed via onMessage).
   */
  private async stepAndWait(method: string): Promise<CDPPauseLocation> {
    this.ensurePaused();
    this.paused = false;
    this.pauseLocation = null;
    await this.send(method, {});
    return this.waitForPause();
  }

  /**
   * Wait until the adapter enters the paused state (driven by incoming
   * Debugger.paused events processed on the socket).  Times out after 30 s.
   */
  private waitForPause(): Promise<CDPPauseLocation> {
    return new Promise<CDPPauseLocation>((resolve, reject) => {
      const timeoutMs = 30_000;
      const interval = 50;
      let elapsed = 0;

      const check = (): void => {
        if (this.paused && this.pauseLocation) {
          resolve(this.pauseLocation);
          return;
        }
        if (!this.connected) {
          reject(new Error("CDPAdapter: connection lost while waiting for pause"));
          return;
        }
        elapsed += interval;
        if (elapsed >= timeoutMs) {
          reject(new Error("CDPAdapter: timed out waiting for pause event (30 s)"));
          return;
        }
        setTimeout(check, interval);
      };
      // First check after one tick so the event loop can process incoming data.
      setTimeout(check, interval);
    });
  }

  private ensurePaused(): void {
    if (!this.paused) {
      throw new Error("CDPAdapter: debugger is not paused — this operation requires a paused state");
    }
  }

  /** Map a CDP scriptId to its source URL / file path. */
  private resolveScriptUrl(scriptId: string | undefined): string | null {
    if (!scriptId) return null;
    return this.scriptMap.get(scriptId) ?? null;
  }

  /**
   * Format a CDP RemoteObject into a friendlier shape.
   * Large string values are truncated to VALUE_PREVIEW_LIMIT.
   */
  private formatRemoteObject(obj: any): { type: string; value: unknown; preview?: string } {
    if (!obj) return { type: "undefined", value: undefined };
    const type: string = obj.type ?? "undefined";
    let value: unknown = obj.value;
    let preview: string | undefined;

    if (obj.preview) {
      preview = this.stringifyPreview(obj.preview);
    } else if (type === "string" && typeof value === "string") {
      if (value.length > VALUE_PREVIEW_LIMIT) {
        preview = value.slice(0, VALUE_PREVIEW_LIMIT) + "…";
      }
    } else if (obj.description) {
      preview = String(obj.description).slice(0, VALUE_PREVIEW_LIMIT);
    }

    // For non-primitive types, value is often undefined in CDP; use description.
    if (value === undefined && obj.description) {
      value = obj.description;
    }

    return { type, value, preview };
  }

  /** Build a human-readable preview string from a CDP ObjectPreview. */
  private stringifyPreview(preview: any): string {
    if (!preview || !preview.properties) {
      return preview?.description ?? String(preview);
    }
    const entries: string[] = [];
    for (const p of preview.properties) {
      const val = p.value ?? p.type ?? "…";
      entries.push(`${p.name}: ${val}`);
      // Stop building the string once it's large enough
      if (entries.join(", ").length > VALUE_PREVIEW_LIMIT) break;
    }
    const inner = entries.join(", ");
    if (preview.type === "object" && preview.subtype === "array") {
      return `[${inner}]`;
    }
    return `{${inner}}`;
  }
}

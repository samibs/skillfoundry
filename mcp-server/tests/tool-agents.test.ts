import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { spawn, type ChildProcess } from "child_process";

let serverProcess: ChildProcess;
const PORT = 9879;

beforeAll(async () => {
  serverProcess = spawn("tsx", ["src/server.ts"], {
    cwd: import.meta.dirname ? import.meta.dirname.replace("/tests", "") : process.cwd(),
    env: { ...process.env, SKILLFOUNDRY_PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Server start timeout")), 10000);
    const check = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:${PORT}/health`);
        if (res.ok) {
          clearInterval(check);
          clearTimeout(timeout);
          resolve();
        }
      } catch {
        // not ready
      }
    }, 200);
  });
});

afterAll(() => {
  serverProcess?.kill("SIGTERM");
});

describe("Tool Agents via MCP", () => {
  it("lists tool agent tools alongside skill tools", async () => {
    const transport = new SSEClientTransport(
      new URL(`http://localhost:${PORT}/mcp/sse`)
    );
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(transport);

    const tools = await client.listTools();

    // Tool agents should be present
    const toolNames = tools.tools.map((t) => t.name);
    expect(toolNames).toContain("sf_verify_auth");
    expect(toolNames).toContain("sf_security_scan");
    expect(toolNames).toContain("sf_memory_gate");

    // LLM skills should also be present
    expect(toolNames).toContain("sf_forge");

    await client.close();
  });

  it("memory gate evaluates LLM reasoning as observed", async () => {
    const transport = new SSEClientTransport(
      new URL(`http://localhost:${PORT}/mcp/sse`)
    );
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(transport);

    const result = await client.callTool({
      name: "sf_memory_gate",
      arguments: {
        action: "evaluate",
        framework: "nextauth",
        versionRange: "5.x-beta",
        quirk: "signIn() drops cookies",
        fix: "use redirect: false",
        evidenceSource: "llm_reasoning",
        evidenceSummary: "I think this should work",
      },
    });

    const content = result.content[0];
    expect(content).toHaveProperty("type", "text");
    const parsed = JSON.parse((content as { text: string }).text);
    expect(parsed.entry.confidence).toBe("observed");
    expect(parsed.decision.reason).toContain("NOT been verified");

    await client.close();
  });

  it("memory gate evaluates Playwright evidence as verified", async () => {
    const transport = new SSEClientTransport(
      new URL(`http://localhost:${PORT}/mcp/sse`)
    );
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(transport);

    const result = await client.callTool({
      name: "sf_memory_gate",
      arguments: {
        action: "evaluate",
        framework: "nextauth",
        quirk: "signIn() drops cookies",
        fix: "use redirect: false",
        evidenceSource: "playwright",
        evidenceSummary: "Playwright test passed with screenshot",
      },
    });

    const parsed = JSON.parse(
      (result.content[0] as { text: string }).text
    );
    expect(parsed.entry.confidence).toBe("verified");

    await client.close();
  });

  it("semgrep scan runs against a real path", async () => {
    const transport = new SSEClientTransport(
      new URL(`http://localhost:${PORT}/mcp/sse`)
    );
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(transport);

    const result = await client.callTool({
      name: "sf_security_scan",
      arguments: {
        projectPath: import.meta.dirname
          ? import.meta.dirname.replace("/tests", "/src")
          : process.cwd() + "/src",
        rules: ["p/typescript"],
      },
    });

    const parsed = JSON.parse(
      (result.content[0] as { text: string }).text
    );
    // Should have scanned files (pass or fail, but stats should exist)
    expect(parsed.stats).toBeDefined();
    expect(typeof parsed.stats.filesScanned).toBe("number");
    expect(typeof parsed.duration).toBe("number");

    await client.close();
  });
});

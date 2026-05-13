import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { spawn, type ChildProcess } from "child_process";

let serverProcess: ChildProcess;
const PORT = 9878;
const TEST_TOKEN = "sf-test-token-abc123";
const AUTH_HEADER = { Authorization: `Bearer ${TEST_TOKEN}` };

beforeAll(async () => {
  serverProcess = spawn("tsx", ["src/server.ts"], {
    cwd: import.meta.dirname ? import.meta.dirname.replace("/tests", "") : process.cwd(),
    env: { ...process.env, SKILLFOUNDRY_PORT: String(PORT), SKILLFOUNDRY_API_TOKEN: TEST_TOKEN },
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
        // Server not ready yet
      }
    }, 200);
  });
});

afterAll(() => {
  serverProcess?.kill("SIGTERM");
});

describe("MCP Server — public endpoints", () => {
  it("health endpoint is accessible without auth", async () => {
    const res = await fetch(`http://localhost:${PORT}/health`);
    expect(res.status).toBe(200);
    const data = await res.json() as { status: string; tools: { registered: number } };
    expect(["starting", "healthy"]).toContain(data.status);
    expect(data.tools.registered).toBeGreaterThan(0);
  });

  it("ready endpoint is accessible without auth", async () => {
    const res = await fetch(`http://localhost:${PORT}/ready`);
    expect([200, 503]).toContain(res.status);
  });
});

describe("MCP Server — auth enforcement", () => {
  it("agents endpoint returns 401 with no token", async () => {
    const res = await fetch(`http://localhost:${PORT}/api/v1/agents`);
    expect(res.status).toBe(401);
    const data = await res.json() as { error: { code: string } };
    expect(data.error.code).toBe("UNAUTHORIZED");
  });

  it("agents endpoint returns 401 with wrong token", async () => {
    const res = await fetch(`http://localhost:${PORT}/api/v1/agents`, {
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
  });

  it("MCP SSE endpoint returns 401 with no token", async () => {
    const res = await fetch(`http://localhost:${PORT}/mcp/sse`, {
      headers: { Accept: "text/event-stream" },
    });
    expect(res.status).toBe(401);
  });
});

describe("MCP Server — agents API", () => {
  it("agents endpoint lists skills", async () => {
    const res = await fetch(`http://localhost:${PORT}/api/v1/agents`, { headers: AUTH_HEADER });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { data: unknown[]; meta: { total: number } };
    expect(data.meta.total).toBeGreaterThan(50);
    expect(data.data.length).toBe(data.meta.total);
  });
});

describe("MCP Server — MCP protocol", () => {
  it("MCP client can connect and list tools", async () => {
    const transport = new SSEClientTransport(
      new URL(`http://localhost:${PORT}/mcp/sse`),
      { requestInit: { headers: AUTH_HEADER } }
    );
    const client = new Client({ name: "test-client", version: "1.0.0" });

    await client.connect(transport);

    const tools = await client.listTools();
    expect(tools.tools.length).toBeGreaterThan(50);

    const forgeSkill = tools.tools.find((t) => t.name === "sf_forge");
    expect(forgeSkill).toBeDefined();
    expect(forgeSkill?.description).toBeTruthy();

    await client.close();
  });

  it("MCP client can invoke a skill", async () => {
    const transport = new SSEClientTransport(
      new URL(`http://localhost:${PORT}/mcp/sse`),
      { requestInit: { headers: AUTH_HEADER } }
    );
    const client = new Client({ name: "test-client", version: "1.0.0" });

    await client.connect(transport);

    const result = await client.callTool({
      name: "sf_health",
      arguments: { projectPath: "/tmp" },
    });

    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toHaveProperty("type", "text");

    await client.close();
  });
});

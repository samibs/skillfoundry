import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { spawn, type ChildProcess } from "child_process";

let serverProcess: ChildProcess;
const PORT = 9880;

beforeAll(async () => {
  serverProcess = spawn("tsx", ["src/server.ts"], {
    cwd: import.meta.dirname ? import.meta.dirname.replace("/tests", "") : process.cwd(),
    env: { ...process.env, SKILLFOUNDRY_PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Server start timeout")), 15000);
    const check = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:${PORT}/health`);
        if (res.ok) {
          clearInterval(check);
          clearTimeout(timeout);
          resolve();
        }
      } catch { /* not ready */ }
    }, 300);
  });
});

afterAll(() => {
  serverProcess?.kill("SIGTERM");
});

describe("Tier 1/2/3 Tool Agents via MCP", () => {
  it("lists all tool agents in MCP tools", async () => {
    const transport = new SSEClientTransport(new URL(`http://localhost:${PORT}/mcp/sse`));
    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(transport);

    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);

    // Tier 1
    expect(names).toContain("sf_build");
    expect(names).toContain("sf_run_tests");
    expect(names).toContain("sf_check_deps");
    expect(names).toContain("sf_assign_port");
    expect(names).toContain("sf_check_port");

    // Tier 2
    expect(names).toContain("sf_git_status");
    expect(names).toContain("sf_git_commit");
    expect(names).toContain("sf_typecheck");
    expect(names).toContain("sf_lint");
    expect(names).toContain("sf_migrate");
    expect(names).toContain("sf_check_env");

    // Tier 3
    expect(names).toContain("sf_lighthouse");
    expect(names).toContain("sf_docker_build");
    expect(names).toContain("sf_docker_compose");
    expect(names).toContain("sf_nginx_config");

    // Pre-existing
    expect(names).toContain("sf_verify_auth");
    expect(names).toContain("sf_security_scan");
    expect(names).toContain("sf_memory_gate");
    expect(names).toContain("sf_create_skill");

    await client.close();
  });

  it("sf_build runs on the MCP server itself", async () => {
    const transport = new SSEClientTransport(new URL(`http://localhost:${PORT}/mcp/sse`));
    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(transport);

    const result = await client.callTool({
      name: "sf_build",
      arguments: {
        projectPath: import.meta.dirname?.replace("/tests", "") || process.cwd(),
      },
    });

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.passed).toBe(true);
    expect(parsed.command).toContain("build");

    await client.close();
  });

  it("sf_typecheck runs on the MCP server itself", async () => {
    const transport = new SSEClientTransport(new URL(`http://localhost:${PORT}/mcp/sse`));
    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(transport);

    const result = await client.callTool({
      name: "sf_typecheck",
      arguments: {
        projectPath: import.meta.dirname?.replace("/tests", "") || process.cwd(),
      },
    });

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.passed).toBe(true);
    expect(parsed.errorCount).toBe(0);

    await client.close();
  });

  it("sf_check_port works", async () => {
    const transport = new SSEClientTransport(new URL(`http://localhost:${PORT}/mcp/sse`));
    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(transport);

    const result = await client.callTool({
      name: "sf_check_port",
      arguments: { port: PORT },
    });

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.inUse).toBe(true);

    await client.close();
  });

  it("sf_git_status works", async () => {
    const transport = new SSEClientTransport(new URL(`http://localhost:${PORT}/mcp/sse`));
    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(transport);

    const result = await client.callTool({
      name: "sf_git_status",
      arguments: {
        projectPath: import.meta.dirname?.replace("/tests", "") || process.cwd(),
      },
    });

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.branch).toBeTruthy();

    await client.close();
  });

  it("sf_nginx_config generates valid config", async () => {
    const transport = new SSEClientTransport(new URL(`http://localhost:${PORT}/mcp/sse`));
    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(transport);

    const result = await client.callTool({
      name: "sf_nginx_config",
      arguments: { domain: "test.example.com", port: 3000 },
    });

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.generated).toBe(true);
    expect(parsed.config).toContain("proxy_pass http://127.0.0.1:3000");
    expect(parsed.config).toContain("test.example.com");
    expect(parsed.config).toContain("ssl_protocols");

    await client.close();
  });

  it("sf_check_env detects missing .env", async () => {
    const transport = new SSEClientTransport(new URL(`http://localhost:${PORT}/mcp/sse`));
    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(transport);

    const result = await client.callTool({
      name: "sf_check_env",
      arguments: { projectPath: "/tmp" },
    });

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.exampleExists).toBe(false);

    await client.close();
  });
});

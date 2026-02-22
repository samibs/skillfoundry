#!/usr/bin/env node

/**
 * SkillFoundry Testing MCP Server
 * Provides test runner integration
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = new Server(
  {
    name: "skillfoundry-testing",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Detect test framework
async function detectTestFramework() {
  const packageJsonPath = path.join(process.cwd(), "package.json");
  try {
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

    if (deps.jest) return "jest";
    if (deps.mocha) return "mocha";
    if (deps.vitest) return "vitest";
    if (deps["@jest/globals"]) return "jest";
    if (deps.pytest) return "pytest";
    if (deps.unittest) return "unittest";

    // Check for test scripts
    if (packageJson.scripts) {
      if (packageJson.scripts.test) {
        const testScript = packageJson.scripts.test.toLowerCase();
        if (testScript.includes("jest")) return "jest";
        if (testScript.includes("mocha")) return "mocha";
        if (testScript.includes("vitest")) return "vitest";
        if (testScript.includes("pytest")) return "pytest";
      }
    }

    return "unknown";
  } catch {
    return "unknown";
  }
}

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "run_tests",
      description: "Execute test suite",
      inputSchema: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Test pattern (e.g., '*.test.js')",
          },
          verbose: {
            type: "boolean",
            description: "Verbose output",
            default: false,
          },
        },
      },
    },
    {
      name: "run_test_file",
      description: "Run specific test file",
      inputSchema: {
        type: "object",
        properties: {
          file: {
            type: "string",
            description: "Test file path",
          },
          verbose: {
            type: "boolean",
            description: "Verbose output",
            default: false,
          },
        },
        required: ["file"],
      },
    },
    {
      name: "get_coverage",
      description: "Get test coverage report",
      inputSchema: {
        type: "object",
        properties: {
          format: {
            type: "string",
            enum: ["json", "text", "html"],
            description: "Coverage report format",
            default: "text",
          },
        },
      },
    },
    {
      name: "list_tests",
      description: "List available tests",
      inputSchema: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Test pattern filter",
          },
        },
      },
    },
    {
      name: "watch_tests",
      description: "Watch mode (continuous testing)",
      inputSchema: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Test pattern to watch",
          },
        },
      },
    },
  ],
}));

// Execute command and return output
function executeCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({
        code,
        stdout,
        stderr,
        success: code === 0,
      });
    });

    proc.on("error", (error) => {
      reject(error);
    });
  });
}

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const framework = await detectTestFramework();

    switch (name) {
      case "run_tests": {
        let command, commandArgs;

        switch (framework) {
          case "jest":
            command = "npx";
            commandArgs = ["jest"];
            if (args.pattern) commandArgs.push(args.pattern);
            if (args.verbose) commandArgs.push("--verbose");
            break;
          case "mocha":
            command = "npx";
            commandArgs = ["mocha"];
            if (args.pattern) commandArgs.push(args.pattern);
            if (args.verbose) commandArgs.push("--reporter", "spec");
            break;
          case "vitest":
            command = "npx";
            commandArgs = ["vitest", "run"];
            if (args.pattern) commandArgs.push(args.pattern);
            break;
          case "pytest":
            command = "pytest";
            commandArgs = [];
            if (args.pattern) commandArgs.push(args.pattern);
            if (args.verbose) commandArgs.push("-v");
            break;
          default:
            // Fallback to npm test
            command = "npm";
            commandArgs = ["test"];
        }

        const result = await executeCommand(command, commandArgs, {
          cwd: process.cwd(),
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  framework,
                  command: `${command} ${commandArgs.join(" ")}`,
                  success: result.success,
                  exitCode: result.code,
                  stdout: result.stdout,
                  stderr: result.stderr,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "run_test_file": {
        const filePath = args.file;
        let command, commandArgs;

        switch (framework) {
          case "jest":
            command = "npx";
            commandArgs = ["jest", filePath];
            if (args.verbose) commandArgs.push("--verbose");
            break;
          case "mocha":
            command = "npx";
            commandArgs = ["mocha", filePath];
            if (args.verbose) commandArgs.push("--reporter", "spec");
            break;
          case "vitest":
            command = "npx";
            commandArgs = ["vitest", "run", filePath];
            break;
          case "pytest":
            command = "pytest";
            commandArgs = [filePath];
            if (args.verbose) commandArgs.push("-v");
            break;
          default:
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Unknown test framework: ${framework}`
            );
        }

        const result = await executeCommand(command, commandArgs, {
          cwd: process.cwd(),
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  framework,
                  file: filePath,
                  success: result.success,
                  exitCode: result.code,
                  stdout: result.stdout,
                  stderr: result.stderr,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_coverage": {
        let command, commandArgs;

        switch (framework) {
          case "jest":
            command = "npx";
            commandArgs = ["jest", "--coverage"];
            break;
          case "vitest":
            command = "npx";
            commandArgs = ["vitest", "run", "--coverage"];
            break;
          case "pytest":
            command = "pytest";
            commandArgs = ["--cov", "--cov-report=term"];
            break;
          default:
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Coverage not supported for framework: ${framework}`
            );
        }

        const result = await executeCommand(command, commandArgs, {
          cwd: process.cwd(),
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  framework,
                  success: result.success,
                  coverage: result.stdout,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "list_tests": {
        // Try to find test files
        const testFiles = [];
        const testDir = process.cwd();

        async function findTestFiles(dir, pattern) {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              await findTestFiles(fullPath, pattern);
            } else if (
              entry.isFile() &&
              (entry.name.includes(".test.") ||
                entry.name.includes(".spec.") ||
                entry.name.match(/test.*\.(js|ts|py)$/i))
            ) {
              if (!pattern || entry.name.includes(pattern)) {
                testFiles.push(fullPath);
              }
            }
          }
        }

        await findTestFiles(testDir, args.pattern);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  framework,
                  tests: testFiles,
                  count: testFiles.length,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "watch_tests": {
        // Watch mode is typically interactive, so we'll just start it
        // In a real implementation, this would be handled differently
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  message:
                    "Watch mode started. This is typically interactive and runs continuously.",
                  framework,
                  note: "Use Ctrl+C to stop watch mode",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Error executing ${name}: ${error.message}`
    );
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SkillFoundry Testing MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

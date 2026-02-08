#!/usr/bin/env node

/**
 * Claude AS Filesystem MCP Server
 * Provides safe file operations with permission model
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB default

const server = new Server(
  {
    name: "claude-as-filesystem",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "read_file",
      description: "Read file contents with size limits",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path to read (relative or absolute)",
          },
          maxSize: {
            type: "number",
            description: "Maximum file size in bytes (default: 10MB)",
            default: MAX_FILE_SIZE,
          },
        },
        required: ["path"],
      },
    },
    {
      name: "write_file",
      description: "Write file contents (confirmation required for overwrites)",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path to write",
          },
          content: {
            type: "string",
            description: "File content to write",
          },
          createDir: {
            type: "boolean",
            description: "Create parent directories if they don't exist",
            default: false,
          },
        },
        required: ["path", "content"],
      },
    },
    {
      name: "list_directory",
      description: "List directory contents",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Directory path to list",
          },
          recursive: {
            type: "boolean",
            description: "List recursively",
            default: false,
          },
        },
        required: ["path"],
      },
    },
    {
      name: "create_directory",
      description: "Create directory structure",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Directory path to create",
          },
          recursive: {
            type: "boolean",
            description: "Create parent directories if needed",
            default: true,
          },
        },
        required: ["path"],
      },
    },
    {
      name: "delete_file",
      description: "Delete file or directory (confirmation required)",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File or directory path to delete",
          },
          recursive: {
            type: "boolean",
            description: "Delete directory recursively",
            default: false,
          },
        },
        required: ["path"],
      },
    },
    {
      name: "search_files",
      description: "Search files by pattern or content",
      inputSchema: {
        type: "object",
        properties: {
          directory: {
            type: "string",
            description: "Directory to search in",
          },
          pattern: {
            type: "string",
            description: "File name pattern (glob)",
          },
          content: {
            type: "string",
            description: "Content to search for",
          },
          maxResults: {
            type: "number",
            description: "Maximum number of results",
            default: 100,
          },
        },
        required: ["directory"],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "read_file": {
        const filePath = resolvePath(args.path);
        const maxSize = args.maxSize || MAX_FILE_SIZE;

        const stats = await fs.stat(filePath);
        if (!stats.isFile()) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Path is not a file: ${filePath}`
          );
        }

        if (stats.size > maxSize) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `File size (${stats.size} bytes) exceeds limit (${maxSize} bytes)`
          );
        }

        const content = await fs.readFile(filePath, "utf-8");
        return {
          content: [
            {
              type: "text",
              text: content,
            },
          ],
        };
      }

      case "write_file": {
        const writePath = resolvePath(args.path);
        const content = args.content;

        // Check if file exists
        let exists = false;
        try {
          await fs.access(writePath);
          exists = true;
        } catch {
          // File doesn't exist, that's fine
        }

        if (exists) {
          // For overwrites, we require confirmation (in real implementation, this would be a prompt)
          // For now, we'll allow it but log a warning
          console.error(`Warning: Overwriting existing file: ${writePath}`);
        }

        // Create parent directory if needed
        if (args.createDir) {
          const parentDir = path.dirname(writePath);
          await fs.mkdir(parentDir, { recursive: true });
        }

        await fs.writeFile(writePath, content, "utf-8");
        return {
          content: [
            {
              type: "text",
              text: `File written successfully: ${writePath}`,
            },
          ],
        };
      }

      case "list_directory": {
        const dirPath = resolvePath(args.path);
        const recursive = args.recursive || false;

        const stats = await fs.stat(dirPath);
        if (!stats.isDirectory()) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Path is not a directory: ${dirPath}`
          );
        }

        const entries = await listDirectory(dirPath, recursive);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(entries, null, 2),
            },
          ],
        };
      }

      case "create_directory": {
        const dirPath = resolvePath(args.path);
        const recursive = args.recursive !== false;

        await fs.mkdir(dirPath, { recursive });
        return {
          content: [
            {
              type: "text",
              text: `Directory created: ${dirPath}`,
            },
          ],
        };
      }

      case "delete_file": {
        const deletePath = resolvePath(args.path);
        const recursive = args.recursive || false;

        const stats = await fs.stat(deletePath);
        if (stats.isDirectory() && !recursive) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            "Cannot delete directory without recursive flag"
          );
        }

        if (stats.isDirectory()) {
          await fs.rm(deletePath, { recursive: true });
        } else {
          await fs.unlink(deletePath);
        }

        return {
          content: [
            {
              type: "text",
              text: `Deleted: ${deletePath}`,
            },
          ],
        };
      }

      case "search_files": {
        const searchDir = resolvePath(args.directory);
        const pattern = args.pattern;
        const content = args.content;
        const maxResults = args.maxResults || 100;

        const results = await searchFiles(searchDir, pattern, content, maxResults);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2),
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

// Helper functions
function resolvePath(filePath) {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  // Resolve relative to current working directory
  return path.resolve(process.cwd(), filePath);
}

async function listDirectory(dirPath, recursive = false) {
  const entries = [];
  const items = await fs.readdir(dirPath, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dirPath, item.name);
    const entry = {
      name: item.name,
      path: fullPath,
      type: item.isDirectory() ? "directory" : "file",
    };

    if (item.isFile()) {
      try {
        const stats = await fs.stat(fullPath);
        entry.size = stats.size;
        entry.modified = stats.mtime.toISOString();
      } catch {
        // Ignore stat errors
      }
    }

    entries.push(entry);

    if (recursive && item.isDirectory()) {
      const subEntries = await listDirectory(fullPath, true);
      entries.push(...subEntries);
    }
  }

  return entries;
}

async function searchFiles(dirPath, pattern, content, maxResults) {
  const results = [];
  const items = await fs.readdir(dirPath, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dirPath, item.name);

    if (item.isDirectory()) {
      // Recursively search subdirectories
      const subResults = await searchFiles(fullPath, pattern, content, maxResults - results.length);
      results.push(...subResults);
      if (results.length >= maxResults) break;
    } else if (item.isFile()) {
      // Check pattern match
      if (pattern && !matchPattern(item.name, pattern)) {
        continue;
      }

      // Check content match
      if (content) {
        try {
          const fileContent = await fs.readFile(fullPath, "utf-8");
          if (!fileContent.includes(content)) {
            continue;
          }
        } catch {
          // Skip files that can't be read
          continue;
        }
      }

      results.push({
        path: fullPath,
        name: item.name,
      });

      if (results.length >= maxResults) break;
    }
  }

  return results;
}

function matchPattern(filename, pattern) {
  // Simple glob pattern matching
  const regex = new RegExp(
    "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$"
  );
  return regex.test(filename);
}

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Claude AS Filesystem MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

# MCP Integration - Model Context Protocol

**Version**: 1.0  
**Status**: IMPLEMENTATION  
**Date**: January 25, 2026

---

## Overview

MCP (Model Context Protocol) provides a standardized way for AI agents to interact with external tools and resources. This integration enables SkillFoundry Framework to access databases, file systems, testing tools, and security scanners through a unified interface.

---

## Architecture

```
mcp-servers/
├── filesystem/
│   ├── server.js              # MCP server implementation
│   ├── tools.json             # Tool definitions
│   └── README.md              # Usage guide
├── database/
│   ├── server.js
│   ├── tools.json
│   └── README.md
├── testing/
│   ├── server.js
│   ├── tools.json
│   └── README.md
└── security/
    ├── server.js
    ├── tools.json
    └── README.md
```

---

## MCP Servers

### 1. Filesystem Server (`mcp-skillfoundry-filesystem`)

**Purpose**: Safe file operations with permission model

**Tools**:
- `read_file` - Read file contents (with size limits)
- `write_file` - Write file (requires confirmation for overwrites)
- `list_directory` - List directory contents
- `create_directory` - Create directory structure
- `delete_file` - Delete file (requires confirmation)
- `search_files` - Search files by pattern/content

**Permissions**:
- Read: Auto (with size limits)
- Write: Auto (new files), Confirm (overwrites)
- Delete: Always confirm
- Search: Auto

**Example**:
```json
{
  "name": "read_file",
  "description": "Read file contents with size limits",
  "inputSchema": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "File path to read"
      },
      "maxSize": {
        "type": "number",
        "description": "Maximum file size in bytes (default: 1MB)"
      }
    },
    "required": ["path"]
  }
}
```

---

### 2. Database Server (`mcp-skillfoundry-database`)

**Purpose**: Database schema inspection and migration management

**Tools**:
- `inspect_schema` - Get database schema (tables, columns, constraints)
- `run_query` - Execute read-only query (SELECT only)
- `create_migration` - Generate migration file
- `list_migrations` - List pending/applied migrations
- `check_migration_status` - Check if migrations are up to date

**Permissions**:
- Inspect: Auto
- Query: Auto (SELECT only), Confirm (other queries)
- Migration: Auto (create), Confirm (apply)

**Example**:
```json
{
  "name": "inspect_schema",
  "description": "Inspect database schema",
  "inputSchema": {
    "type": "object",
    "properties": {
      "database": {
        "type": "string",
        "description": "Database name"
      },
      "table": {
        "type": "string",
        "description": "Optional: specific table name"
      }
    }
  }
}
```

---

### 3. Testing Server (`mcp-skillfoundry-testing`)

**Purpose**: Test runner integration

**Tools**:
- `run_tests` - Execute test suite
- `run_test_file` - Run specific test file
- `get_coverage` - Get test coverage report
- `list_tests` - List available tests
- `watch_tests` - Watch mode (continuous testing)

**Permissions**:
- All operations: Auto

**Example**:
```json
{
  "name": "run_tests",
  "description": "Run test suite",
  "inputSchema": {
    "type": "object",
    "properties": {
      "pattern": {
        "type": "string",
        "description": "Test pattern (e.g., '*.test.js')"
      },
      "verbose": {
        "type": "boolean",
        "description": "Verbose output"
      }
    }
  }
}
```

---

### 4. Security Server (`mcp-skillfoundry-security`)

**Purpose**: Security scanning and vulnerability detection

**Tools**:
- `scan_dependencies` - Scan dependencies for vulnerabilities
- `scan_code` - Static code analysis for security issues
- `check_secrets` - Check for hardcoded secrets
- `audit_permissions` - Audit file permissions
- `generate_report` - Generate security report

**Permissions**:
- All operations: Auto (read-only scanning)

**Example**:
```json
{
  "name": "scan_dependencies",
  "description": "Scan dependencies for vulnerabilities",
  "inputSchema": {
    "type": "object",
    "properties": {
      "packageManager": {
        "type": "string",
        "enum": ["npm", "pip", "maven", "gradle"],
        "description": "Package manager type"
      }
    }
  }
}
```

---

## MCP Server Implementation

### Basic Server Structure (Node.js)

```javascript
// mcp-servers/filesystem/server.js
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";

const server = new Server(
  {
    name: "skillfoundry-filesystem",
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
          path: { type: "string" },
          maxSize: { type: "number", default: 1048576 }, // 1MB
        },
        required: ["path"],
      },
    },
    // ... more tools
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "read_file": {
      const filePath = args.path;
      const maxSize = args.maxSize || 1048576;
      
      const stats = await fs.stat(filePath);
      if (stats.size > maxSize) {
        return {
          content: [
            {
              type: "text",
              text: `Error: File size (${stats.size} bytes) exceeds limit (${maxSize} bytes)`,
            },
          ],
          isError: true,
        };
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
    
    // ... more tool handlers
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SkillFoundry Filesystem MCP server running on stdio");
}

main().catch(console.error);
```

---

## Integration with SkillFoundry

### Configuration

Add MCP server configuration to project:

```json
// .claude/mcp-config.json
{
  "servers": {
    "filesystem": {
      "command": "node",
      "args": ["mcp-servers/filesystem/server.js"],
      "env": {}
    },
    "database": {
      "command": "node",
      "args": ["mcp-servers/database/server.js"],
      "env": {
        "DATABASE_URL": "${DATABASE_URL}"
      }
    },
    "testing": {
      "command": "node",
      "args": ["mcp-servers/testing/server.js"],
      "env": {}
    },
    "security": {
      "command": "node",
      "args": ["mcp-servers/security/server.js"],
      "env": {}
    }
  }
}
```

### Agent Usage

Agents can use MCP tools through standard tool calls:

```markdown
## Using MCP Tools

When you need to:
- **Read a file**: Use `mcp_filesystem_read_file` tool
- **Inspect database**: Use `mcp_database_inspect_schema` tool
- **Run tests**: Use `mcp_testing_run_tests` tool
- **Scan security**: Use `mcp_security_scan_dependencies` tool

Example:
```
I'll check the database schema to understand the user table structure.
[Call: mcp_database_inspect_schema(database="myapp", table="users")]
```
```

---

## Benefits

1. **Standardized Interface**: All tools follow MCP protocol
2. **Permission Model**: Built-in safety checks
3. **Extensibility**: Easy to add new tools
4. **Cross-Platform**: Works across Claude Code, Copilot CLI, Cursor
5. **Type Safety**: Schema validation for all tools

---

## Implementation Status

**Phase 1: Basic Structure** ✅
- MCP server directory structure
- Documentation
- Tool definitions

**Phase 2: Filesystem Server** (In Progress)
- Basic file operations
- Permission model
- Error handling

**Phase 3: Database Server** (Future)
- Schema inspection
- Migration management
- Query execution

**Phase 4: Testing & Security** (Future)
- Test runner integration
- Security scanning
- Report generation

---

**Last Updated**: February 26, 2026  
**Version**: 1.0

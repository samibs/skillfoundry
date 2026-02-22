#!/usr/bin/env node

/**
 * SkillFoundry Database MCP Server
 * Provides database schema inspection and migration management
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import pg from "pg";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

let dbPool = null;

const server = new Server(
  {
    name: "skillfoundry-database",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Initialize database connection
function getPool() {
  if (!dbPool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        "DATABASE_URL environment variable not set"
      );
    }
    dbPool = new Pool({ connectionString: databaseUrl });
  }
  return dbPool;
}

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "inspect_schema",
      description: "Inspect database schema (tables, columns, constraints)",
      inputSchema: {
        type: "object",
        properties: {
          database: {
            type: "string",
            description: "Database name (optional, uses connection default)",
          },
          table: {
            type: "string",
            description: "Optional: specific table name",
          },
        },
      },
    },
    {
      name: "run_query",
      description: "Execute read-only query (SELECT only)",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "SQL query to execute (SELECT only)",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "create_migration",
      description: "Generate migration file",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Migration name",
          },
          up: {
            type: "string",
            description: "UP migration SQL",
          },
          down: {
            type: "string",
            description: "DOWN migration SQL",
          },
          directory: {
            type: "string",
            description: "Migrations directory",
            default: "migrations",
          },
        },
        required: ["name", "up"],
      },
    },
    {
      name: "list_migrations",
      description: "List pending/applied migrations",
      inputSchema: {
        type: "object",
        properties: {
          directory: {
            type: "string",
            description: "Migrations directory",
            default: "migrations",
          },
        },
      },
    },
    {
      name: "check_migration_status",
      description: "Check if migrations are up to date",
      inputSchema: {
        type: "object",
        properties: {
          directory: {
            type: "string",
            description: "Migrations directory",
            default: "migrations",
          },
        },
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "inspect_schema": {
        const pool = getPool();
        const tableName = args.table;

        if (tableName) {
          // Get specific table schema
          const tableQuery = `
            SELECT 
              column_name,
              data_type,
              character_maximum_length,
              is_nullable,
              column_default
            FROM information_schema.columns
            WHERE table_name = $1
            ORDER BY ordinal_position;
          `;

          const constraintsQuery = `
            SELECT
              constraint_name,
              constraint_type
            FROM information_schema.table_constraints
            WHERE table_name = $1;
          `;

          const [columns, constraints] = await Promise.all([
            pool.query(tableQuery, [tableName]),
            pool.query(constraintsQuery, [tableName]),
          ]);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    table: tableName,
                    columns: columns.rows,
                    constraints: constraints.rows,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } else {
          // Get all tables
          const tablesQuery = `
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name;
          `;

          const result = await pool.query(tablesQuery);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    tables: result.rows.map((r) => r.table_name),
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }
      }

      case "run_query": {
        const query = args.query.trim().toUpperCase();
        if (!query.startsWith("SELECT")) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            "Only SELECT queries are allowed for safety"
          );
        }

        const pool = getPool();
        const result = await pool.query(args.query);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  rows: result.rows,
                  rowCount: result.rowCount,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "create_migration": {
        const migrationName = args.name;
        const up = args.up;
        const down = args.down || "-- Rollback not implemented";
        const migrationsDir = args.directory || "migrations";

        // Create migrations directory if it doesn't exist
        await fs.mkdir(migrationsDir, { recursive: true });

        // Generate timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
        const filename = `${timestamp}_${migrationName}.sql`;

        const content = `-- Migration: ${migrationName}
-- Created: ${new Date().toISOString()}

-- UP Migration
${up}

-- DOWN Migration
${down}
`;

        const filePath = path.join(migrationsDir, filename);
        await fs.writeFile(filePath, content, "utf-8");

        return {
          content: [
            {
              type: "text",
              text: `Migration created: ${filePath}`,
            },
          ],
        };
      }

      case "list_migrations": {
        const migrationsDir = args.directory || "migrations";

        try {
          const files = await fs.readdir(migrationsDir);
          const migrations = files
            .filter((f) => f.endsWith(".sql"))
            .map((f) => ({
              filename: f,
              path: path.join(migrationsDir, f),
            }));

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ migrations }, null, 2),
              },
            ],
          };
        } catch (error) {
          if (error.code === "ENOENT") {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ migrations: [] }, null, 2),
                },
              ],
            };
          }
          throw error;
        }
      }

      case "check_migration_status": {
        const migrationsDir = args.directory || "migrations";

        // Check if migrations table exists
        const pool = getPool();
        let migrationsTableExists = false;
        try {
          await pool.query("SELECT 1 FROM schema_migrations LIMIT 1");
          migrationsTableExists = true;
        } catch {
          // Table doesn't exist
        }

        const files = await fs.readdir(migrationsDir).catch(() => []);
        const migrationFiles = files.filter((f) => f.endsWith(".sql"));

        let appliedMigrations = [];
        if (migrationsTableExists) {
          const result = await pool.query("SELECT version FROM schema_migrations");
          appliedMigrations = result.rows.map((r) => r.version);
        }

        const pendingMigrations = migrationFiles.filter(
          (f) => !appliedMigrations.includes(f)
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: pendingMigrations.length === 0 ? "up_to_date" : "pending",
                  total: migrationFiles.length,
                  applied: appliedMigrations.length,
                  pending: pendingMigrations.length,
                  pendingMigrations,
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
  console.error("SkillFoundry Database MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

// Cleanup on exit
process.on("SIGINT", async () => {
  if (dbPool) {
    await dbPool.end();
  }
  process.exit(0);
});

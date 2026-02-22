# MCP Database Server

SkillFoundry Database MCP Server - Database schema inspection and migration management.

## Installation

```bash
npm install @modelcontextprotocol/sdk
npm install pg  # For PostgreSQL
# or
npm install mysql2  # For MySQL
# or
npm install sqlite3  # For SQLite
```

## Usage

Configure in your MCP client:

```json
{
  "servers": {
    "skillfoundry-database": {
      "command": "node",
      "args": ["mcp-servers/database/server.js"],
      "env": {
        "DATABASE_URL": "postgresql://user:pass@localhost/dbname"
      }
    }
  }
}
```

## Tools

- `inspect_schema` - Get database schema (tables, columns, constraints)
- `run_query` - Execute read-only query (SELECT only)
- `create_migration` - Generate migration file
- `list_migrations` - List pending/applied migrations
- `check_migration_status` - Check if migrations are up to date

## Permissions

- **Inspect**: Auto
- **Query**: Auto (SELECT only), Confirm (other queries)
- **Migration**: Auto (create), Confirm (apply)

## Example

```javascript
// Inspect schema
{
  "tool": "inspect_schema",
  "arguments": {
    "database": "myapp",
    "table": "users"
  }
}
```

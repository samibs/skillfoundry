# MCP Filesystem Server

Claude AS Filesystem MCP Server - Safe file operations with permission model.

## Installation

```bash
npm install @modelcontextprotocol/sdk
```

## Usage

Configure in your MCP client:

```json
{
  "servers": {
    "claude-as-filesystem": {
      "command": "node",
      "args": ["mcp-servers/filesystem/server.js"]
    }
  }
}
```

## Tools

- `read_file` - Read file contents (max 1MB by default)
- `write_file` - Write file (confirmation required for overwrites)
- `list_directory` - List directory contents
- `create_directory` - Create directory structure
- `delete_file` - Delete file (confirmation required)
- `search_files` - Search files by pattern/content

## Permissions

- **Read**: Auto (with size limits)
- **Write**: Auto (new files), Confirm (overwrites)
- **Delete**: Always confirm
- **Search**: Auto

## Example

```javascript
// Read a file
{
  "tool": "read_file",
  "arguments": {
    "path": "src/main.js",
    "maxSize": 1048576
  }
}
```

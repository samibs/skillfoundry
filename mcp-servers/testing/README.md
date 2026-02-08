# MCP Testing Server

Claude AS Testing MCP Server - Test runner integration.

## Installation

```bash
npm install @modelcontextprotocol/sdk
```

## Usage

Configure in your MCP client:

```json
{
  "servers": {
    "claude-as-testing": {
      "command": "node",
      "args": ["mcp-servers/testing/server.js"]
    }
  }
}
```

## Tools

- `run_tests` - Execute test suite
- `run_test_file` - Run specific test file
- `get_coverage` - Get test coverage report
- `list_tests` - List available tests
- `watch_tests` - Watch mode (continuous testing)

## Permissions

- All operations: Auto

## Example

```javascript
// Run tests
{
  "tool": "run_tests",
  "arguments": {
    "pattern": "*.test.js",
    "verbose": true
  }
}
```

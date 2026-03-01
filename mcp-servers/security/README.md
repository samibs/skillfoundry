# MCP Security Server

SkillFoundry Security MCP Server - Security scanning and vulnerability detection.

## Installation

```bash
npm install @modelcontextprotocol/sdk
npm install npm-audit-report  # For npm scanning
# or
npm install safety  # For Python scanning
```

## Usage

Configure in your MCP client:

```json
{
  "servers": {
    "skillfoundry-security": {
      "command": "node",
      "args": ["mcp-servers/security/server.js"]
    }
  }
}
```

## Tools

- `scan_dependencies` - Scan dependencies for vulnerabilities
- `scan_code` - Static code analysis for security issues
- `check_secrets` - Check for hardcoded secrets
- `audit_permissions` - Audit file permissions
- `generate_report` - Generate security report

## Permissions

- All operations: Auto (read-only scanning)

## Example

```javascript
// Scan dependencies
{
  "tool": "scan_dependencies",
  "arguments": {
    "packageManager": "npm"
  }
}
```

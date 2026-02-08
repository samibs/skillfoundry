# GitHub Copilot CLI Custom Agents

This directory contains custom agent definitions for GitHub Copilot CLI, converted and enhanced from the Claude Code framework.

## 🚀 Quick Start

```bash
# View quick reference
./helper.sh

# View complete workflow guide
cat WORKFLOW-GUIDE.md
```

## 📁 Directory Structure

```
.copilot/
├── custom-agents/          # All agent definitions
│   ├── README.md           # This file
│   ├── coder.md            # Ruthless implementation with TDD
│   ├── tester.md           # Brutal testing
│   ├── architect.md        # Architecture review
│   ├── pr-review.md        # ⭐ PR review specialist
│   ├── github-orchestrator.md  # ⭐ GitHub-aware workflow coordinator
│   ├── github-actions.md   # ⭐ CI/CD debugging specialist
│   ├── commit-message.md   # ⭐ Commit message generator
│   └── ... (22+ more agents)
├── helper.sh               # Quick reference guide
├── WORKFLOW-GUIDE.md       # Complete workflow examples
├── .framework-version      # Framework version
├── .framework-platform     # Platform (copilot)
└── .framework-updated      # Last update date
```

⭐ = Enhanced with GitHub integration

## 🎯 Core Agents

### Development Agents

| Agent | File | Purpose |
|-------|------|---------|
| **Coder** | `coder.md` | TDD-driven implementation with GitHub pattern search |
| **Tester** | `tester.md` | Comprehensive testing (positive, negative, edge cases, security) |
| **Architect** | `architect.md` | Multi-persona architecture review |
| **Debugger** | `debugger.md` | Systematic four-phase debugging |

### GitHub-Integrated Agents

| Agent | File | Purpose |
|-------|------|---------|
| **GitHub Orchestrator** | `github-orchestrator.md` | Workflow coordination with GitHub APIs |
| **PR Review** | `pr-review.md` | Ruthless code review with GitHub context |
| **GitHub Actions** | `github-actions.md` | CI/CD monitoring and failure analysis |
| **Commit Message** | `commit-message.md` | Conventional commit message generation |

### Quality & Standards

| Agent | File | Purpose |
|-------|------|---------|
| **Evaluator** | `evaluator.md` | BPSBS compliance checking |
| **Standards** | `standards.md` | Code standards enforcement |
| **Gate Keeper** | `gate-keeper.md` | Capability verification |
| **Security Scanner** | `security-scanner.md` | AI vulnerability detection (uses ANTI_PATTERNS) |

### Project Management

| Agent | File | Purpose |
|-------|------|---------|
| **PRD** | `prd.md` | PRD creation and validation |
| **Stories** | `stories.md` | User story generation |
| **Orchestrate** | `orchestrate.md` | Project orchestration |
| **Metrics** | `metrics.md` | Metrics tracking |

## 💡 Usage Pattern

Agents are invoked via the GitHub Copilot CLI's `task` tool:

```javascript
task(
  agent_type="task",           // or "explore" or "code-review"
  description="Brief summary",  // 3-5 words
  prompt="Detailed instructions with context"
)
```

### Basic Example

```javascript
task(
  agent_type="task",
  description="Implement auth service",
  prompt=`
    Read .copilot/custom-agents/coder.md
    Read genesis/user-authentication.md
    
    Implement user authentication following TDD protocol.
  `
)
```

### Advanced Example with GitHub Integration

```javascript
task(
  agent_type="task",
  description="Analyze and implement issue",
  prompt=`
    Read .copilot/custom-agents/github-orchestrator.md
    Read .copilot/custom-agents/coder.md
    
    For issue #42 in myorg/myrepo:
    1. Get issue details and requirements
    2. Search for similar implementations
    3. Find related PRs for patterns
    4. Create implementation plan
    5. Implement following TDD protocol
    6. Monitor GitHub Actions
  `
)
```

## 🔗 Agent Chaining

Chain multiple agents for complex workflows:

```javascript
// 1. Orchestrator: Analyze issue
const plan = task(...github-orchestrator...)

// 2. Coder: Implement with context
const code = task(...coder with plan context...)

// 3. Tester: Brutal testing
const tests = task(...tester...)

// 4. PR Review: Self-review
const review = task(...pr-review...)

// 5. GitHub Actions: Monitor CI
const ci = task(...github-actions...)
```

## 📚 Shared Modules

All agents reference shared protocols in `../agents/`:

| Module | Purpose |
|--------|---------|
| `_tdd-protocol.md` | RED-GREEN-REFACTOR cycle |
| `_context-discipline.md` | Token management |
| `_systematic-debugging.md` | Four-phase debugging |
| `_agent-protocol.md` | Inter-agent communication |
| `_parallel-dispatch.md` | Parallel execution |
| `_git-worktrees.md` | Git worktree isolation |

## 🔒 Security References

Critical security documents (root directory):

| Document | Purpose |
|----------|---------|
| `../docs/ANTI_PATTERNS_BREADTH.md` | Wide coverage of 15 security anti-patterns |
| `../docs/ANTI_PATTERNS_DEPTH.md` | Deep dive on top 7 critical vulnerabilities |
| `../CLAUDE.md` | Zero tolerance standards |

**Key Security Stats**:
- AI code has **86% XSS failure rate** (vs 31.6% human)
- **2.74x more likely** to have XSS vulnerabilities
- **5-21% package hallucination rate**

Always include relevant security modules in your prompts for security-sensitive code.

## 🎨 Agent Types

### `agent_type="task"`

For implementation, analysis, and work:
- Coder
- Tester
- Architect
- GitHub Orchestrator
- GitHub Actions
- Commit Message
- All others

### `agent_type="explore"`

For questions and exploration:
- Quick codebase searches
- Understanding patterns
- Finding examples

### `agent_type="code-review"`

For PR reviews:
- PR Review agent
- High signal-to-noise ratio
- Only flags genuine issues

## 🔥 Enhanced GitHub Features

### What's New for Copilot CLI

1. **GitHub Orchestrator** - Leverages all GitHub MCP tools:
   - Search code across repos
   - Analyze PRs and issues
   - Monitor workflows
   - Track commits and branches

2. **PR Review Agent** - Code review specialist:
   - Fetches PR diffs and comments
   - Checks CI/CD status
   - Reviews against standards
   - Only flags real issues (bugs, security, logic)

3. **GitHub Actions Agent** - CI/CD expert:
   - Monitors workflow runs
   - Analyzes failure logs
   - Categorizes issues
   - Provides systematic fixes

4. **Commit Message Generator** - Conventional commits:
   - Analyzes git diffs
   - Generates proper commit messages
   - Follows conventional format
   - Includes issue references

5. **Enhanced Coder** - GitHub-aware implementation:
   - Searches for similar code
   - Finds team patterns from PRs
   - References existing implementations

## 📖 Complete Workflows

See `WORKFLOW-GUIDE.md` for complete examples:

- Issue → Implementation → PR
- PR Review Process  
- Debug CI/CD Failures
- Generate Commit Messages
- Release Preparation
- Pattern Discovery

## 🛠️ GitHub API Tools Available

### Repository
- `github-mcp-server-search_repositories`
- `github-mcp-server-search_code`
- `github-mcp-server-get_file_contents`
- `github-mcp-server-list_branches`
- `github-mcp-server-list_commits`
- `github-mcp-server-get_commit`

### Pull Requests
- `github-mcp-server-list_pull_requests`
- `github-mcp-server-search_pull_requests`
- `github-mcp-server-pull_request_read`
  - Methods: get, get_diff, get_status, get_files, get_review_comments, get_reviews, get_comments

### Issues
- `github-mcp-server-list_issues`
- `github-mcp-server-search_issues`
- `github-mcp-server-issue_read`
  - Methods: get, get_comments, get_sub_issues, get_labels

### GitHub Actions
- `github-mcp-server-actions_list`
- `github-mcp-server-actions_get`
- `github-mcp-server-get_job_logs`

## 📝 Best Practices

1. **Always reference agent instructions** in your prompt
2. **Include relevant shared modules** (agents/_*.md)
3. **Provide GitHub context** (issue #, PR #, etc.)
4. **Chain agents** for complex tasks
5. **Use correct agent type** (task/explore/code-review)
6. **Monitor CI/CD** after changes
7. **Follow standards** (CLAUDE.md)

## 🚦 Quality Gates

Framework enforces zero tolerance for:
- TODOs, FIXMEs, PLACEHOLDERs
- Mock data in production code
- Hardcoded credentials
- Empty implementations
- Missing tests

See `../CLAUDE.md` for complete list.

## 🔍 Quick Reference Commands

```bash
# View all agents
ls -la custom-agents/

# Search for specific agent
grep -l "keyword" custom-agents/*.md

# View workflow examples
cat WORKFLOW-GUIDE.md

# Check framework version
cat .framework-version

# Quick help
./helper.sh
```

## 📚 Additional Resources

- **Genesis Workflow**: See `../genesis/TEMPLATE.md`
- **Framework Standards**: See `../CLAUDE.md`
- **BPSBS Standards**: See `../CLAUDE.md`
- **Shared Protocols**: See `../agents/_*.md`

## 🆘 Getting Help

1. Run `./helper.sh` for quick reference
2. Read `WORKFLOW-GUIDE.md` for complete examples
3. Check specific agent `.md` file for details
4. Review shared modules in `../agents/`
5. Consult `../CLAUDE.md` for overall standards

---

**Framework Version**: 1.1.0 (Enhanced for GitHub Copilot CLI)  
**Platform**: GitHub Copilot CLI  
**Updated**: 2026-01-22

Happy building with GitHub Copilot CLI! 🚀

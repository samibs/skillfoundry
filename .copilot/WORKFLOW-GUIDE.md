# GitHub Copilot CLI - Complete Workflow Guide

This guide demonstrates end-to-end workflows using the agent framework with GitHub integration.

## Table of Contents

1. [Setup](#setup)
2. [Core Workflows](#core-workflows)
3. [Agent Chaining](#agent-chaining)
4. [GitHub Integration Examples](#github-integration-examples)
5. [Best Practices](#best-practices)

---

## Setup

### Installation

```bash
cd /path/to/your/project
~/path/to/claude_as/install.sh --platform=copilot
```

### Quick Reference

```bash
# View available agents
ls -la .copilot/custom-agents/

# View helper guide
.copilot/helper.sh

# View shared protocols
ls -la agents/
```

---

## Core Workflows

### Workflow 1: Issue → Implementation → PR

**Scenario**: Implement feature from GitHub issue #42

```javascript
// Step 1: Analyze Issue with GitHub Orchestrator
task(
  agent_type="task",
  description="Analyze issue and plan",
  prompt=`
    Read .copilot/custom-agents/github-orchestrator.md
    Read genesis/TEMPLATE.md
    
    For issue #42 in myorg/myrepo:
    1. Get issue details and comments
    2. Search codebase for similar features
    3. Find related PRs and commits
    4. Create implementation plan
    5. Generate PRD in genesis/
    
    Output: PRD file and implementation strategy
  `
)

// Step 2: Implement with Coder Agent
task(
  agent_type="task",
  description="Implement feature with TDD",
  prompt=`
    Read .copilot/custom-agents/coder.md
    Read agents/_tdd-protocol.md
    Read genesis/issue-42-feature.md
    
    Implement the feature:
    1. Search GitHub for similar implementations
    2. Follow RED-GREEN-REFACTOR cycle
    3. Write failing tests first
    4. Implement minimal code to pass
    5. Refactor for quality
    
    Reference similar code from:
    - PR #38 (similar feature)
    - src/existing/pattern.ts
  `
)

// Step 3: Brutal Testing
task(
  agent_type="task",
  description="Comprehensive testing",
  prompt=`
    Read .copilot/custom-agents/tester.md
    
    Test the implementation:
    1. Positive test cases
    2. Edge cases and boundaries
    3. Security probes
    4. Performance stress tests
    5. Integration failure scenarios
  `
)

// Step 4: Create PR
// (Manual: git add, commit, push, create PR)

// Step 5: Monitor CI/CD
task(
  agent_type="task",
  description="Monitor GitHub Actions",
  prompt=`
    Read .copilot/custom-agents/github-actions.md
    
    For latest workflow run:
    1. Check all job statuses
    2. If failures, get logs and analyze
    3. Provide root cause and fixes
  `
)
```

### Workflow 2: PR Review

**Scenario**: Review PR #123 submitted by teammate

```javascript
task(
  agent_type="code-review",
  description="Review PR comprehensively",
  prompt=`
    Read .copilot/custom-agents/pr-review.md
    Read agents/_tdd-protocol.md
    Read agents/_context-discipline.md
    Read bpsbs.md
    
    Review PR #123 in myorg/myrepo:
    1. Get PR diff and files changed
    2. Read PR description and linked issues
    3. Check GitHub Actions status
    4. Review against framework standards:
       - TDD protocol followed?
       - No TODOs or placeholders?
       - Security considerations?
       - Error handling comprehensive?
    5. Check test coverage
    6. Look for bugs, logic errors, security issues
    
    Provide: APPROVE / REQUEST CHANGES / COMMENT
    High signal-to-noise ratio only.
  `
)
```

### Workflow 3: Debug CI/CD Failure

**Scenario**: Tests failing in GitHub Actions

```javascript
// Step 1: Analyze Failure
task(
  agent_type="task",
  description="Analyze CI failure",
  prompt=`
    Read .copilot/custom-agents/github-actions.md
    
    For workflow run #${runId}:
    1. Get failed job details
    2. Retrieve logs (tail 500 lines)
    3. Categorize failure type
    4. Identify error patterns
  `
)

// Step 2: Systematic Debugging
task(
  agent_type="task",
  description="Debug test failure",
  prompt=`
    Read .copilot/custom-agents/debugger.md
    Read agents/_systematic-debugging.md
    
    Apply Four-Phase Debugging:
    
    1. OBSERVE: [specific error from logs]
    2. HYPOTHESIZE:
       - What could cause this?
       - Any recent changes related?
       - Environment differences?
    3. TEST:
       - Reproduce locally
       - Isolate the failure
       - Test hypotheses
    4. VERIFY:
       - Confirm root cause
       - Implement fix
       - Verify fix works
    
    Apply Five Whys to find root cause, not symptoms.
  `
)

// Step 3: Fix and Verify
task(
  agent_type="task",
  description="Implement fix",
  prompt=`
    Read .copilot/custom-agents/coder.md
    
    Fix identified issue:
    1. Write test that reproduces bug
    2. Implement minimal fix
    3. Verify test passes
    4. Add guards to prevent recurrence
    
    Then commit and push to trigger new workflow run.
  `
)
```

### Workflow 4: Generate Commit Message

**Scenario**: Ready to commit staged changes

```javascript
task(
  agent_type="task",
  description="Generate commit message",
  prompt=`
    Read .copilot/custom-agents/commit-message.md
    
    Analyze staged changes:
    1. Run 'git diff --cached --stat'
    2. Run 'git diff --cached'
    3. Identify type (feat/fix/refactor/etc)
    4. Determine scope from file paths
    5. Generate conventional commit message
    
    Format:
    <type>(<scope>): <subject>
    
    <body>
    
    <footer with issue references>
    
    Provide 2-3 variations if ambiguous.
  `
)
```

### Workflow 5: Security Scan & Fix

**Scenario**: Scan codebase for AI-specific vulnerabilities

```javascript
// Step 1: Comprehensive Security Scan
task(
  agent_type="task",
  description="Security vulnerability scan",
  prompt=`
    Read .copilot/custom-agents/security-scanner.md
    Read ANTI_PATTERNS_BREADTH.md
    Read ANTI_PATTERNS_DEPTH.md
    
    Scan entire codebase for:
    1. Top 7 critical vulnerabilities:
       - Hardcoded secrets
       - SQL injection
       - XSS
       - Insecure randomness
       - Auth/authz flaws
       - Package hallucination
       - Command injection
    
    2. Additional patterns (15 total)
    
    Provide:
    - Severity classification (CRITICAL/HIGH/MEDIUM/LOW)
    - Specific file:line locations
    - Attack scenarios
    - Secure fix examples
    - References to anti-pattern docs
  `
)

// Step 2: Fix Critical Issues
task(
  agent_type="task",
  description="Fix security vulnerabilities",
  prompt=`
    Read .copilot/custom-agents/coder.md
    Read ANTI_PATTERNS_DEPTH.md
    
    Fix identified CRITICAL issues:
    1. [Issue 1: Hardcoded AWS keys in config.js]
    2. [Issue 2: SQL injection in users.js]
    
    For each fix:
    - Use secure patterns from ANTI_PATTERNS_DEPTH.md
    - Write tests to verify vulnerability is fixed
    - Add comments explaining security consideration
    - Follow TDD protocol
  `
)

// Step 3: Verify Fixes
task(
  agent_type="task",
  description="Verify security fixes",
  prompt=`
    Re-scan previously vulnerable files:
    
    1. Run security scanner on fixed files
    2. Verify vulnerabilities resolved
    3. Check no new issues introduced
    4. Confirm secure patterns used correctly
    
    Provide verification report.
  `
)
```

---

## Agent Chaining

### Chain 1: Full Feature Development

```javascript
// Orchestrate → Plan → Implement → Test → Review → Deploy

// 1. GitHub Orchestrator (Analysis)
const context = task(
  agent_type="task",
  description="Analyze and plan",
  prompt="Read github-orchestrator.md, analyze issue #42, create plan"
)

// 2. Coder Agent (Implementation)
const implementation = task(
  agent_type="task",
  description="Implement with TDD",
  prompt=`Read coder.md, implement based on ${context}`
)

// 3. Tester Agent (Testing)
const testResults = task(
  agent_type="task",
  description="Brutal testing",
  prompt=`Read tester.md, test ${implementation}`
)

// 4. PR Review Agent (Quality Gate)
const review = task(
  agent_type="code-review",
  description="Self-review",
  prompt=`Review implementation against standards`
)

// 5. GitHub Actions Agent (CI/CD)
const ciStatus = task(
  agent_type="task",
  description="Monitor CI/CD",
  prompt=`Check GitHub Actions status for latest run`
)
```

### Chain 2: Bug Fix Workflow

```javascript
// Debug → Fix → Test → Verify

// 1. Systematic Debugger
const rootCause = task(
  agent_type="task",
  description="Find root cause",
  prompt=`
    Read debugger.md and _systematic-debugging.md
    Debug issue: [description]
    Apply Four-Phase debugging
  `
)

// 2. Coder (Fix)
const fix = task(
  agent_type="task",
  description="Implement fix",
  prompt=`
    Based on root cause: ${rootCause}
    1. Write failing test
    2. Implement minimal fix
    3. Verify test passes
  `
)

// 3. Tester (Regression Tests)
const tests = task(
  agent_type="task",
  description="Add regression tests",
  prompt=`
    Ensure this bug never happens again:
    - Test the specific failure case
    - Test related edge cases
    - Add guards
  `
)
```

---

## GitHub Integration Examples

### Example 1: Find and Reuse Code Patterns

```javascript
task(
  agent_type="explore",
  description="Find auth patterns",
  prompt=`
    Search GitHub for authentication implementations:
    
    1. Search this repo:
       github-mcp-server-search_code({
         query: "JWT authentication repo:myorg/myrepo language:typescript"
       })
    
    2. Find recent PRs with auth changes:
       github-mcp-server-search_pull_requests({
         query: "authentication is:merged",
         owner: "myorg",
         repo: "myrepo"
       })
    
    3. Summarize common patterns and best practices
  `
)
```

### Example 2: Monitor Multiple PRs

```javascript
task(
  agent_type="task",
  description="Monitor team PRs",
  prompt=`
    Read .copilot/custom-agents/github-orchestrator.md
    
    For myorg/myrepo:
    1. List all open PRs
    2. Check GitHub Actions status for each
    3. Identify PRs with failures
    4. For each failure:
       - Get failed job logs
       - Categorize issue
       - Suggest fix
    
    Provide summary dashboard.
  `
)
```

### Example 3: Release Preparation

```javascript
task(
  agent_type="task",
  description="Prepare release",
  prompt=`
    Read github-orchestrator.md and commit-message.md
    
    For release v2.0.0:
    1. List all merged PRs since last release
    2. Categorize by type (feat/fix/breaking)
    3. Generate changelog
    4. Create release notes
    5. Identify breaking changes
    6. Generate migration guide if needed
  `
)
```

---

## Best Practices

### 1. Always Reference Agent Instructions

```javascript
// ✅ Good
prompt=`
  Read .copilot/custom-agents/coder.md
  Read agents/_tdd-protocol.md
  Implement feature X following TDD
`

// ❌ Bad
prompt=`Implement feature X with tests`
```

### 2. Provide Context from GitHub

```javascript
// ✅ Good
prompt=`
  Read github-orchestrator.md
  Get issue #42 details
  Search for similar PRs
  Implement following team patterns
`

// ❌ Bad
prompt=`Implement the issue feature`
```

### 3. Chain Agents for Complex Tasks

```javascript
// ✅ Good - Multiple specialized agents
orchestrator → coder → tester → reviewer

// ❌ Bad - One agent does everything
single_agent → all tasks
```

### 4. Use Correct Agent Type

```javascript
// ✅ For questions and exploration
agent_type="explore"

// ✅ For implementation and work
agent_type="task"

// ✅ For PR reviews
agent_type="code-review"
```

### 5. Reference Shared Modules

```javascript
// ✅ Good
prompt=`
  Read agents/_tdd-protocol.md
  Read agents/_systematic-debugging.md
  [task details]
`

// These provide consistent standards across all work
```

### 6. Include Issue/PR Context

```javascript
// ✅ Good
prompt=`
  For issue #42:
  - Read issue comments
  - Check linked PRs
  - Search for related code
  - Implement following discovered patterns
`
```

### 7. Monitor and Validate

```javascript
// After implementation, always:
1. Check GitHub Actions status
2. Review against standards
3. Verify test coverage
4. Validate security
```

---

## Common Patterns

### Pattern: Feature Development

```
Issue Analysis → PRD Creation → Implementation → Testing → PR Review → CI/CD → Merge
     ↓              ↓                ↓              ↓          ↓          ↓
Orchestrator    Orchestrator     Coder         Tester    PR Review  Actions
```

### Pattern: Bug Fix

```
Bug Report → Reproduce → Root Cause → Fix → Test → Verify → Deploy
    ↓           ↓           ↓          ↓      ↓       ↓       ↓
GitHub    Debugger    Debugger    Coder  Tester  Actions  Actions
```

### Pattern: Code Review

```
PR Created → Get Context → Review Code → Check CI → Provide Feedback
     ↓            ↓             ↓           ↓            ↓
  GitHub    Orchestrator   PR Review    Actions    PR Review
```

---

## Quick Command Reference

```bash
# View all agents
ls .copilot/custom-agents/

# View agent details
cat .copilot/custom-agents/coder.md

# View shared protocols
cat agents/_tdd-protocol.md

# View helper
.copilot/helper.sh

# View examples
cat .copilot/WORKFLOW-GUIDE.md  # This file
```

---

## Getting Help

1. **Agent-specific**: Read the agent's .md file
2. **Shared protocols**: Check agents/_*.md
3. **Standards**: Read CLAUDE.md and bpsbs.md
4. **Workflows**: This guide
5. **Quick ref**: Run `.copilot/helper.sh`

---

## Next Steps

1. Create your first PRD in `genesis/`
2. Try the Issue → Implementation workflow
3. Experiment with agent chaining
4. Review a PR using the pr-review agent
5. Debug a CI failure with the github-actions agent

Happy building! 🚀

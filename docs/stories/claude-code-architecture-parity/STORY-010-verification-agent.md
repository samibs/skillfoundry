---
story_id: STORY-010
title: Verification Agent Tool
phase: 4
priority: MUST
complexity: medium
depends_on: [STORY-001]
blocks: []
layers: [backend]
---

# STORY-010: Verification Agent Tool

## Objective

Create a new MCP tool `sf_verify` that validates other agents' output by running verification checks (build, test, typecheck) and comparing results against claimed output.

## Technical Approach

### 1. Create Tool Folder

```
src/tools/VerificationAgent/
├── index.ts
├── VerificationAgent.ts
├── constants.ts
├── prompt.ts
└── permissions.ts
```

### 2. Verification Strategies

```typescript
export type VerificationStrategy = 'build' | 'test' | 'typecheck' | 'lint' | 'custom';

export interface VerificationCheck {
  name: string;
  strategy: VerificationStrategy;
  passed: boolean;
  evidence: string;           // Raw output from verification tool
  expectedClaim?: string;     // What the agent claimed
  actualResult?: string;      // What actually happened
}

export interface VerificationReport {
  verified: boolean;           // Overall pass/fail
  sessionId: string;
  checks: VerificationCheck[];
  timestamp: string;
  duration: number;
}
```

### 3. Execution Logic

`VerificationAgent.ts`:

```typescript
export async function verify(args: {
  projectPath: string;
  strategies: VerificationStrategy[];
  claims?: Record<string, string>;  // Optional: what the agent claimed
}): Promise<VerificationReport> {
  const checks: VerificationCheck[] = [];
  const start = Date.now();

  for (const strategy of args.strategies) {
    switch (strategy) {
      case 'build':
        // Run sf_build logic, compare to claim
        checks.push(await verifyBuild(args.projectPath, args.claims?.build));
        break;
      case 'test':
        // Run sf_run_tests logic, compare to claim
        checks.push(await verifyTests(args.projectPath, args.claims?.test));
        break;
      case 'typecheck':
        // Run sf_typecheck logic, compare to claim
        checks.push(await verifyTypecheck(args.projectPath, args.claims?.typecheck));
        break;
      case 'lint':
        checks.push(await verifyLint(args.projectPath, args.claims?.lint));
        break;
    }
  }

  return {
    verified: checks.every(c => c.passed),
    sessionId: '',  // Filled by handler
    checks,
    timestamp: new Date().toISOString(),
    duration: Date.now() - start,
  };
}
```

### 4. Tool Schema

```typescript
export const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    projectPath: { type: 'string', description: 'Absolute path to project root' },
    strategies: {
      type: 'array',
      items: { type: 'string', enum: ['build', 'test', 'typecheck', 'lint'] },
      description: 'Verification strategies to run',
    },
    claims: {
      type: 'object',
      description: 'Optional: what the previous agent claimed (e.g., {"build": "passed", "test": "15/15 passed"})',
    },
  },
  required: ['projectPath', 'strategies'],
};
```

### 5. Auto-Verify Hook (Optional)

If `SKILLFOUNDRY_AUTO_VERIFY=true`:
- After any sf_* tool completes, automatically run sf_verify with relevant strategy
- Log verification result alongside tool result
- Do NOT block — just annotate the response

## Acceptance Criteria

```gherkin
Given a project with a passing build
When sf_verify is called with strategies=["build"]
Then it returns {verified: true, checks: [{name: "build", passed: true, evidence: "..."}]}

Given a project with failing tests
When sf_verify is called with strategies=["test"] and claims={"test": "all passed"}
Then it returns {verified: false, checks: [{name: "test", passed: false, expectedClaim: "all passed", actualResult: "3 failed"}]}

Given strategies=["build", "test", "typecheck"]
When all three pass
Then verified=true

Given strategies=["build", "test"]
When build passes but tests fail
Then verified=false

Given SKILLFOUNDRY_AUTO_VERIFY=true
When sf_build completes
Then sf_verify automatically runs with strategies=["build"]
And the result is logged (not blocking)
```

## Files to Create

| Action | File | Purpose |
|--------|------|---------|
| CREATE | `src/tools/VerificationAgent/index.ts` | ToolModule export |
| CREATE | `src/tools/VerificationAgent/VerificationAgent.ts` | Verification logic |
| CREATE | `src/tools/VerificationAgent/constants.ts` | Schema + name |
| CREATE | `src/tools/VerificationAgent/prompt.ts` | System prompt |
| CREATE | `src/tools/VerificationAgent/permissions.ts` | Permission config |
| MODIFY | `src/mcp/handler.ts` | Optional auto-verify hook |

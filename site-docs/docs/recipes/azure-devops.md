---
sidebar_position: 3
title: "Azure DevOps"
---

# Integrate SkillFoundry with Azure DevOps

This recipe shows how to run SkillFoundry quality gates in Azure DevOps pipelines, publish gate reports as pipeline artifacts, enforce gates on pull requests, and integrate security scanning.

## Prerequisites

- **Azure DevOps** (Azure DevOps Services or Azure DevOps Server 2020+)
- A project repository with SkillFoundry initialized (`skillfoundry init` already run)
- **Node.js 20+** available on your build agent (self-hosted or Microsoft-hosted)
- `ANTHROPIC_API_KEY` stored as a pipeline secret variable (if using AI-powered features)

## Step 1: Basic Pipeline with Gates

Add a SkillFoundry gate stage to your `azure-pipelines.yml`. This runs all T1-T6 gates and publishes the results:

```yaml
# azure-pipelines.yml

trigger:
  branches:
    include:
      - main
      - develop

pool:
  vmImage: "ubuntu-latest"

variables:
  nodeVersion: "20.x"

stages:
  - stage: Build
    displayName: "Build & Test"
    jobs:
      - job: BuildJob
        steps:
          - task: UseNode@1
            inputs:
              version: $(nodeVersion)
            displayName: "Install Node.js"

          - script: npm ci
            displayName: "Install dependencies"

          - script: npm run build
            displayName: "Build project"

          - script: npm test
            displayName: "Run tests"

  - stage: QualityGates
    displayName: "SkillFoundry Quality Gates"
    dependsOn: Build
    jobs:
      - job: GateJob
        steps:
          - task: UseNode@1
            inputs:
              version: $(nodeVersion)
            displayName: "Install Node.js"

          - script: npm ci
            displayName: "Install dependencies"

          - script: npm install -g skillfoundry
            displayName: "Install SkillFoundry"

          - script: skillfoundry gate run --html --yes
            displayName: "Run quality gates"
            env:
              ANTHROPIC_API_KEY: $(ANTHROPIC_API_KEY)

          - task: PublishBuildArtifacts@1
            inputs:
              pathToPublish: ".skillfoundry/reports"
              artifactName: "gate-reports"
            displayName: "Publish gate reports"
            condition: always()
```

### What This Does

1. **Build stage** compiles and tests your code as usual
2. **QualityGates stage** installs SkillFoundry and runs all gates
3. Gate reports (HTML) are published as pipeline artifacts, accessible from the pipeline run summary
4. The `condition: always()` on the publish step ensures reports are available even when gates fail

## Step 2: PR Validation

Enforce gates on pull requests by adding a PR trigger and configuring branch policies:

```yaml
# azure-pipelines.yml — add PR trigger

trigger:
  branches:
    include:
      - main

pr:
  branches:
    include:
      - main
      - develop

stages:
  - stage: QualityGates
    displayName: "PR Quality Gates"
    jobs:
      - job: GateJob
        steps:
          - task: UseNode@1
            inputs:
              version: "20.x"
            displayName: "Install Node.js"

          - script: npm ci
            displayName: "Install dependencies"

          - script: npm install -g skillfoundry
            displayName: "Install SkillFoundry"

          - script: |
              skillfoundry gate run --html --yes --verbose
              GATE_EXIT=$?
              echo "##vso[task.setvariable variable=gateResult]$GATE_EXIT"
              exit $GATE_EXIT
            displayName: "Run quality gates"
            env:
              ANTHROPIC_API_KEY: $(ANTHROPIC_API_KEY)

          - task: PublishBuildArtifacts@1
            inputs:
              pathToPublish: ".skillfoundry/reports"
              artifactName: "pr-gate-reports"
            displayName: "Publish gate reports"
            condition: always()
```

Then configure the branch policy in Azure DevOps:

1. Navigate to **Repos > Branches**
2. Click the policies icon on your `main` branch
3. Under **Build Validation**, add this pipeline
4. Set **Trigger** to "Automatic"
5. Set **Policy requirement** to "Required"

Now every PR must pass all quality gates before it can be merged.

## Step 3: Gate Results as Pipeline Artifacts

Gate reports provide detailed findings for each gate. Configure artifact publishing for different report formats:

```yaml
# Publish HTML reports for browser viewing
- task: PublishBuildArtifacts@1
  inputs:
    pathToPublish: ".skillfoundry/reports"
    artifactName: "gate-reports-html"
  displayName: "Publish HTML reports"
  condition: always()

# Publish JUnit-format results for Azure DevOps test tab
- task: PublishTestResults@2
  inputs:
    testResultsFormat: "JUnit"
    testResultsFiles: ".skillfoundry/reports/*.xml"
    mergeTestResults: true
    testRunTitle: "SkillFoundry Gates"
  displayName: "Publish gate results to Test tab"
  condition: always()
```

With JUnit publishing, gate results appear in the **Tests** tab of each pipeline run, giving the team a familiar interface for reviewing pass/fail status.

## Step 4: Security Scanning Integration

Combine SkillFoundry's T4 (Security) gate with dedicated security scanning tools for defense in depth:

```yaml
- stage: Security
  displayName: "Security Scanning"
  dependsOn: Build
  jobs:
    - job: SecurityJob
      steps:
        - task: UseNode@1
          inputs:
            version: "20.x"
          displayName: "Install Node.js"

        - script: npm ci
          displayName: "Install dependencies"

        - script: npm install -g skillfoundry
          displayName: "Install SkillFoundry"

        # SkillFoundry security gate (T4)
        - script: skillfoundry gate run --scope=T4 --html --yes
          displayName: "Run SkillFoundry security gate"
          env:
            ANTHROPIC_API_KEY: $(ANTHROPIC_API_KEY)

        # npm audit for dependency vulnerabilities
        - script: npm audit --production --audit-level=high
          displayName: "npm dependency audit"
          continueOnError: true

        # Publish all security reports
        - task: PublishBuildArtifacts@1
          inputs:
            pathToPublish: ".skillfoundry/reports"
            artifactName: "security-reports"
          displayName: "Publish security reports"
          condition: always()
```

### What T4 Checks in CI

When running in a CI environment (detected by the `CI` or `TF_BUILD` environment variables), the T4 security gate performs additional checks:

- **Secret scanning:** Checks committed code for API keys, tokens, and credentials
- **Dependency analysis:** Flags packages with known vulnerabilities
- **Auth validation:** Verifies that API routes enforce authentication
- **Input validation:** Checks that user input is sanitized at system boundaries
- **Header checks:** Verifies security headers (CSP, CSRF, HSTS) are configured

## Full Pipeline Example

Here is a complete pipeline that combines build, test, gates, and security:

```yaml
# azure-pipelines.yml — full pipeline

trigger:
  branches:
    include:
      - main
      - develop

pr:
  branches:
    include:
      - main

pool:
  vmImage: "ubuntu-latest"

variables:
  nodeVersion: "20.x"

stages:
  # Stage 1: Build and unit test
  - stage: Build
    displayName: "Build & Test"
    jobs:
      - job: BuildJob
        steps:
          - task: UseNode@1
            inputs:
              version: $(nodeVersion)
          - script: npm ci
            displayName: "Install dependencies"
          - script: npm run build
            displayName: "Build"
          - script: npm test -- --coverage
            displayName: "Unit tests with coverage"
          - task: PublishTestResults@2
            inputs:
              testResultsFormat: "JUnit"
              testResultsFiles: "coverage/junit.xml"
            condition: always()

  # Stage 2: Quality gates
  - stage: Gates
    displayName: "Quality Gates"
    dependsOn: Build
    jobs:
      - job: GateJob
        steps:
          - task: UseNode@1
            inputs:
              version: $(nodeVersion)
          - script: npm ci
            displayName: "Install dependencies"
          - script: npm install -g skillfoundry
            displayName: "Install SkillFoundry"
          - script: skillfoundry gate run --html --yes
            displayName: "Run all gates (T1-T6)"
            env:
              ANTHROPIC_API_KEY: $(ANTHROPIC_API_KEY)
          - task: PublishBuildArtifacts@1
            inputs:
              pathToPublish: ".skillfoundry/reports"
              artifactName: "gate-reports"
            condition: always()

  # Stage 3: Security (parallel with gates)
  - stage: Security
    displayName: "Security Scan"
    dependsOn: Build
    jobs:
      - job: SecurityJob
        steps:
          - task: UseNode@1
            inputs:
              version: $(nodeVersion)
          - script: npm ci
            displayName: "Install dependencies"
          - script: npm install -g skillfoundry
            displayName: "Install SkillFoundry"
          - script: skillfoundry gate run --scope=T4 --html --yes
            displayName: "Security gate (T4)"
            env:
              ANTHROPIC_API_KEY: $(ANTHROPIC_API_KEY)
          - script: npm audit --production --audit-level=high
            displayName: "Dependency audit"
            continueOnError: true
          - task: PublishBuildArtifacts@1
            inputs:
              pathToPublish: ".skillfoundry/reports"
              artifactName: "security-reports"
            condition: always()
```

Note that the **Gates** and **Security** stages run in parallel (both depend only on **Build**), reducing total pipeline time.

## Tips

### Agent Pools

For self-hosted agents (common with Azure DevOps Server 2020 on-premises), ensure the agent has:

- **Node.js 20+** installed and on the PATH
- **npm global prefix** writable by the agent user (or use `npx skillfoundry` instead of a global install)
- **Network access** to the npm registry (or configure a private registry)
- **Outbound HTTPS** to `api.anthropic.com` if using AI-powered features

For Microsoft-hosted agents, Node.js is available via the `UseNode` task and no additional setup is needed.

### Artifact Publishing

Gate reports are saved to `.skillfoundry/reports/` in multiple formats:

| Format | File | Use Case |
|--------|------|----------|
| HTML | `report.html` | Human-readable, open in browser from artifacts |
| JSON | `report.json` | Machine-readable, parse in downstream pipeline steps |
| JUnit XML | `report.xml` | Publish to Azure DevOps Test tab |

To use gate results in downstream decisions:

```yaml
- script: |
    GATE_RESULT=$(cat .skillfoundry/reports/report.json | python3 -c "import sys,json; print(json.load(sys.stdin)['summary']['passed'])")
    echo "##vso[task.setvariable variable=gatesPassed;isOutput=true]$GATE_RESULT"
  name: ParseGates
  displayName: "Parse gate results"
```

### Badge Integration

Add a gate status badge to your repository README. After configuring the pipeline, get the badge URL from:

1. Navigate to **Pipelines > Your Pipeline**
2. Click the three-dot menu > **Status badge**
3. Copy the Markdown snippet

```markdown
[![Quality Gates](https://dev.azure.com/your-org/your-project/_apis/build/status/quality-gates?branchName=main)](https://dev.azure.com/your-org/your-project/_build)
```

### Caching for Faster Pipelines

Cache the npm dependencies and SkillFoundry installation to speed up pipeline runs:

```yaml
- task: Cache@2
  inputs:
    key: 'npm | "$(Agent.OS)" | package-lock.json'
    restoreKeys: |
      npm | "$(Agent.OS)"
    path: "$(Pipeline.Workspace)/.npm"
  displayName: "Cache npm packages"

- script: npm ci --cache $(Pipeline.Workspace)/.npm
  displayName: "Install dependencies (cached)"
```

## Next Steps

- [Configuration](/configuration) — Full reference for all config options and CLI flags
- [Next.js Recipe](/recipes/nextjs) — Framework-specific gate behavior for Next.js
- [Monorepo Recipe](/recipes/monorepo) — Running gates across workspace packages

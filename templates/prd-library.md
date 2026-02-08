# PRD: {{PROJECT_NAME}}

---
prd_id: {{PROJECT_NAME_KEBAB}}
title: {{PROJECT_NAME}}
version: 1.0
status: DRAFT
created: {{DATE}}
author: Quick Start Wizard
last_updated: {{DATE}}

# DEPENDENCIES (for inter-PRD coordination)
dependencies:
  requires: []
  recommends: []
  blocks: []
  shared_with: []

tags: [library, package]
priority: high
layers: [backend]
---

---

## 1. Overview

### 1.1 Problem Statement

{{PROJECT_DESC}}

### 1.2 Proposed Solution

Build a reusable library/package with a clean public API, comprehensive documentation, semantic versioning, and thorough test coverage. Designed for consumption by other projects via package managers.

### 1.3 Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Feature completeness | 0% | 100% | All public API methods implemented |
| Test coverage | 0% | 90%+ | Automated test suite (higher bar for libraries) |
| API surface documentation | 0% | 100% | Every public method documented |
| Bundle size | N/A | Minimal | Bundlephobia / size analysis |

---

## 2. User Stories

### Primary User: Developer (Consumer)

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | developer | install the library via package manager | I can add it to my project easily | MUST |
| US-002 | developer | import specific functions/classes | I can use only what I need (tree-shaking) | MUST |
| US-003 | developer | read API documentation with examples | I can use the library correctly | MUST |
| US-004 | developer | get TypeScript types / type hints | I get IDE autocomplete and type safety | MUST |
| US-005 | developer | see a changelog for version updates | I know what changed between versions | SHOULD |
| US-006 | developer | rely on semantic versioning | I can safely update patch/minor versions | SHOULD |
| US-007 | developer | run the library without side effects on import | it doesn't pollute global state | MUST |

---

## 3. Functional Requirements

### 3.1 Core Features

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-001 | Public API | Clean, well-defined public interface | Given library import, When calling public methods, Then expected results returned |
| FR-002 | Type Definitions | Full TypeScript types or Python type hints | Given IDE usage, When using library, Then autocomplete and type checking work |
| FR-003 | Error Handling | Custom error classes with clear messages | Given invalid input, When calling methods, Then descriptive error thrown |
| FR-004 | Zero Side Effects | No global state mutation on import | Given fresh import, When loading module, Then no side effects occur |
| FR-005 | Configuration | Optional configuration for customization | Given config object, When initializing, Then behavior customized |

### 3.2 Public API Design

```
// Example API surface
import { create, validate, transform } from '{{PROJECT_NAME_KEBAB}}'

// Core operations
const result = create(input, options?)
const isValid = validate(data, schema?)
const output = transform(input, rules)

// Configuration
import { configure } from '{{PROJECT_NAME_KEBAB}}'
configure({ strict: true, locale: 'en' })

// Error handling
import { LibraryError, ValidationError } from '{{PROJECT_NAME_KEBAB}}/errors'
```

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Requirement |
|--------|-------------|
| Import time | < 50ms |
| Core operation latency | < 10ms for typical inputs |
| Memory footprint | < 5MB for typical usage |
| Bundle size (minified + gzipped) | < 20KB |

### 4.2 Compatibility

| Aspect | Requirement |
|--------|-------------|
| Module formats | ESM and CJS (dual export) |
| Node.js versions | >= 18 LTS |
| Browser support | Modern browsers (if applicable) |
| TypeScript | >= 5.0 |

### 4.3 Quality

| Aspect | Requirement |
|--------|-------------|
| Test coverage | >= 90% line coverage |
| Linting | Zero errors, zero warnings |
| Type strictness | Strict mode enabled |
| Dependencies | Minimal (prefer zero runtime deps) |

---

## 5. Technical Specifications

### 5.1 Package Structure

```
{{PROJECT_NAME_KEBAB}}/
├── src/
│   ├── index.ts          # Public API exports
│   ├── core/             # Core logic
│   ├── errors/           # Custom error classes
│   ├── types/            # Type definitions
│   └── utils/            # Internal utilities
├── tests/
│   ├── unit/             # Unit tests
│   ├── integration/      # Integration tests
│   └── fixtures/         # Test data
├── docs/
│   ├── api/              # Generated API docs
│   └── guides/           # Usage guides
├── dist/                 # Built output (ESM + CJS)
├── package.json
├── tsconfig.json
├── README.md
├── CHANGELOG.md
└── LICENSE
```

### 5.2 Package.json Essentials

```json
{
  "name": "{{PROJECT_NAME_KEBAB}}",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/cjs/index.js",
  "module": "./dist/esm/index.js",
  "types": "./dist/types/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/esm/index.js",
      "require": "./dist/cjs/index.js",
      "types": "./dist/types/index.d.ts"
    }
  },
  "files": ["dist", "README.md", "LICENSE"],
  "engines": { "node": ">=18" }
}
```

### 5.3 Versioning Strategy

| Change Type | Version Bump | Example |
|-------------|--------------|---------|
| Bug fix (no API change) | PATCH | 1.0.0 -> 1.0.1 |
| New feature (backward compatible) | MINOR | 1.0.0 -> 1.1.0 |
| Breaking change | MAJOR | 1.0.0 -> 2.0.0 |
| Pre-release | Pre-release tag | 1.0.0-beta.1 |

---

## 6. Constraints & Assumptions

### 6.1 Constraints
- **Technical:** Zero or minimal runtime dependencies
- **Distribution:** Must publish to npm/PyPI/crates.io

### 6.2 Out of Scope
- [ ] CLI wrapper (separate package if needed)
- [ ] GUI or visual tools
- [ ] Backend server or API
- [ ] Framework-specific adapters (React, Angular, etc.)

---

## 7. Risks & Mitigations

| ID | Risk | Likelihood | Impact | Mitigation Strategy |
|----|------|------------|--------|---------------------|
| R-001 | Breaking API changes after v1.0 | M | H | Strict semver, deprecation period |
| R-002 | Dependency vulnerabilities | M | M | Minimal deps, automated scanning |
| R-003 | Poor developer experience | M | H | Comprehensive docs, examples, TypeScript types |

---

## 8. Implementation Plan

### 8.1 Phases

| Phase | Name | Scope | Prerequisites |
|-------|------|-------|---------------|
| 1 | Core API | Public API, core logic, types, error classes | None |
| 2 | Testing | Unit tests, integration tests, edge cases | Phase 1 |
| 3 | Packaging | Build system, dual exports, docs, publish | Phase 2 |

### 8.2 Effort Estimate

| Phase | Effort | Complexity | Risk |
|-------|--------|------------|------|
| 1 | M | Med | Low |
| 2 | M | Low | Low |
| 3 | S | Med | Med |

---

## 9. Acceptance Criteria

### 9.1 Definition of Done

- [ ] All public API methods implemented
- [ ] Test coverage >= 90% for all source files
- [ ] TypeScript types / type hints complete
- [ ] API documentation generated and reviewed
- [ ] CHANGELOG.md maintained with all changes
- [ ] Package builds successfully (ESM + CJS)
- [ ] No runtime dependencies (or justified minimal set)
- [ ] README includes installation, quick start, and API overview
- [ ] No critical/high severity bugs open
- [ ] Published to package registry (npm/PyPI/crates.io)

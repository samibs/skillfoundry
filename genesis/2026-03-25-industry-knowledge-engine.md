# PRD: Industry Knowledge Engine — Domain-Specific Intelligence for AI-Assisted Development

**Date**: 2026-03-25
**Author**: n00b73 + Claude
**Status**: DRAFT
**Priority**: HIGH
**Estimated Effort**: Large (3 phases)

---

## Problem Statement

When building domain-specific applications (tax calculators, fintech platforms, trading dashboards, compliance tools), developers need **industry knowledge** — regulatory rules, calculation formulas, compliance requirements, legal exceptions — that no code framework provides.

Currently, this knowledge is gathered through:
1. Manual ChatGPT/Claude.ai research sessions (hours per domain)
2. Copy-paste from regulatory websites (no structure, no citations)
3. Stack Overflow and blog posts (often outdated, jurisdiction-specific)
4. Expensive domain consultants (not available for indie devs)

**The result**: Knowledge lives in chat history, is not reusable across projects, has no source citations, and cannot be validated against implementation. Every new project in the same domain starts from scratch.

**Impact**: SkillFoundry has 64 agents that enforce *how* to build software, but zero agents that know *what* the software should do in a specific industry. This gap forces developers out of the framework for the most critical part of development — understanding the domain.

---

## Solution Overview

An **Industry Knowledge Engine** that provides structured, citable, queryable domain knowledge as first-class framework resources. Knowledge is organized into **Industry Packs** — versioned bundles of rules, references, examples, and validators for a specific domain.

### Architecture (3 Tiers)

```
┌─────────────────────────────────────────────────────────┐
│  TIER 3: Pattern Recognition (cross-project learning)   │
│  ─ Captures domain patterns from completed projects     │
│  ─ Recalls patterns when starting new projects          │
│  ─ Promotes recurring patterns to pack contributions    │
├─────────────────────────────────────────────────────────┤
│  TIER 2: Domain Agents (/domain command)                │
│  ─ Query packs with natural language                    │
│  ─ Validate code against domain rules                   │
│  ─ Generate domain-aware PRDs                           │
│  ─ Produce compliance matrices                          │
├─────────────────────────────────────────────────────────┤
│  TIER 1: Industry Knowledge Packs (static, curated)     │
│  ─ Structured rules (JSONL, queryable)                  │
│  ─ Human-readable reference docs                        │
│  ─ Implementation examples and patterns                 │
│  ─ Business rule validators                             │
│  ─ Source citations (legislation, standards)             │
└─────────────────────────────────────────────────────────┘
```

---

## User Stories

### US-1: Query domain knowledge (P0)

**As a** developer building a tax application,
**I want to** ask "/domain explain VAT reverse charge mechanism in Luxembourg",
**So that** I get a structured answer with the rule, exceptions, calculation example, and source legislation — without leaving my IDE.

**Acceptance Criteria**:
- [ ] `/domain explain <topic>` returns structured response from the matching pack
- [ ] Response includes: rule summary, exceptions, calculation formula (if applicable), source citation
- [ ] If no pack matches, returns "No industry pack for this domain. Available packs: [list]"
- [ ] Response is formatted as markdown with clear sections

### US-2: Validate implementation against domain rules (P0)

**As a** developer who implemented VAT calculation,
**I want to** run "/domain validate src/vat-calculator.ts",
**So that** it checks my implementation against the EU VAT rule pack and reports violations.

**Acceptance Criteria**:
- [ ] `/domain validate <file>` scans code for domain rule violations
- [ ] Each violation cites the specific rule, article, or regulation
- [ ] Produces a pass/fail report similar to `/certify` output
- [ ] Validators are defined per-pack in `validation.ts`

### US-3: Generate domain-aware PRD (P1)

**As a** developer starting a new fintech project,
**I want to** run "/domain prd 'payment processing platform for EU market'",
**So that** it generates a PRD pre-populated with relevant regulatory requirements (PSD2, AML, GDPR).

**Acceptance Criteria**:
- [ ] `/domain prd <description>` generates a PRD in `genesis/`
- [ ] PRD includes regulatory requirements section auto-populated from matching packs
- [ ] Non-functional requirements include compliance checklist items
- [ ] Out-of-scope section lists regulations that need legal review

### US-4: Browse domain rules as structured data (P1)

**As a** developer implementing multi-country VAT,
**I want to** run "/domain matrix 'EU VAT rates by country and category'",
**So that** I get a structured table I can use directly in my implementation.

**Acceptance Criteria**:
- [ ] `/domain matrix <query>` returns structured table from pack data
- [ ] Data is in machine-readable format (JSON or markdown table)
- [ ] Includes last-updated date and source reference
- [ ] Can export as JSON for direct use in code

### US-5: Cross-project pattern learning (P2)

**As a** developer who built taxnavigator last month,
**I want** the framework to recall VAT patterns I used when I start a new tax-related project,
**So that** I don't re-research the same domain knowledge.

**Acceptance Criteria**:
- [ ] Domain patterns captured during `/forge` runs are stored in pack contributions
- [ ] Smart router detects domain context from PRD keywords
- [ ] Relevant domain patterns are auto-loaded into session context
- [ ] Pattern quality is tracked (used count, success rate)

### US-6: Install and manage packs (P0)

**As a** developer,
**I want to** run "/domain install eu-vat" to add the EU VAT knowledge pack,
**So that** domain knowledge is available without manual setup.

**Acceptance Criteria**:
- [ ] `/domain install <pack>` installs from the pack registry
- [ ] `/domain list` shows installed packs with version and rule count
- [ ] `/domain update <pack>` updates to latest version
- [ ] `/domain info <pack>` shows pack details, rule count, last updated, sources
- [ ] Packs are stored in `packs/<name>/` directory

---

## Functional Requirements

### FR-1: Industry Pack Format

Each pack is a directory with a standardized structure:

```
packs/<domain>/
├── pack.json                 ← Pack metadata (name, version, jurisdiction, last_updated)
├── rules.jsonl               ← Structured rules (machine-readable)
├── reference.md              ← Human-readable guide (the "textbook")
├── glossary.md               ← Domain terminology definitions
├── examples/                 ← Implementation patterns
│   ├── calculation-vat.ts    ← Code examples
│   └── flow-kyc.md           ← Process flow examples
├── matrices/                 ← Structured data tables
│   ├── rates.json            ← e.g., VAT rates by country
│   └── thresholds.json       ← e.g., KYC thresholds by risk level
├── validators/               ← Business rule validators
│   └── validate.ts           ← Exports validate(code: string): ValidationResult[]
├── SOURCES.md                ← Citation index (legislation, URLs, publication dates)
└── CHANGELOG.md              ← Pack version history
```

### FR-2: Rule Schema (rules.jsonl)

Each line in `rules.jsonl` is a JSON object:

```json
{
  "id": "EU-VAT-001",
  "domain": "eu-vat",
  "category": "rates",
  "title": "Standard VAT rate range",
  "rule": "EU member states must apply a standard VAT rate of at least 15%",
  "details": "Article 97 of the VAT Directive (2006/112/EC) sets the minimum standard rate at 15%. Member states are free to set higher rates.",
  "jurisdiction": "EU",
  "exceptions": ["Reduced rates permitted for specific goods/services (Annex III)", "Super-reduced rates grandfathered for some member states"],
  "formula": null,
  "effective_date": "2006-01-01",
  "source": "Council Directive 2006/112/EC, Article 97",
  "source_url": "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32006L0112",
  "confidence": "legislation",
  "tags": ["vat", "rates", "standard-rate", "minimum"],
  "last_verified": "2026-01-15"
}
```

**Confidence levels**:
- `legislation` — directly from law/regulation text
- `regulatory_guidance` — from regulator guidance documents
- `industry_standard` — from widely-accepted industry practice
- `expert_interpretation` — from professional analysis (cite source)
- `community_knowledge` — from developer communities (lower confidence)

### FR-3: Pack Metadata (pack.json)

```json
{
  "name": "eu-vat",
  "version": "1.0.0",
  "title": "EU VAT Rules & Rates",
  "description": "Value Added Tax rules, rates, exceptions, and calculation patterns for EU member states",
  "jurisdiction": ["EU", "EEA"],
  "industries": ["tax", "ecommerce", "saas", "fintech"],
  "rule_count": 156,
  "matrix_count": 4,
  "example_count": 12,
  "languages": ["en"],
  "last_updated": "2026-03-01",
  "authors": ["SkillFoundry Team"],
  "license": "CC-BY-SA-4.0",
  "disclaimer": "This pack is for development reference only. Always consult a qualified tax advisor for production implementations.",
  "dependencies": ["gdpr"]
}
```

### FR-4: Domain Agent Commands

```
/domain install <pack>                  Install a knowledge pack
/domain list                            List installed packs
/domain update [pack]                   Update pack(s)
/domain info <pack>                     Pack details and statistics
/domain explain <topic>                 Query pack knowledge
/domain validate <file> [--pack name]   Validate code against domain rules
/domain matrix <query>                  Get structured data table
/domain prd <description>               Generate domain-aware PRD
/domain search <keywords>               Search across all installed packs
/domain cite <rule-id>                  Get full citation for a rule
```

### FR-5: Pack Validator Integration

Each pack can include `validators/validate.ts` that exports:

```typescript
export interface DomainViolation {
  rule_id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  file: string;
  line?: number;
  regulation: string;
  recommendation: string;
}

export function validate(filePath: string, content: string): DomainViolation[];
```

This integrates with `/certify` as an additional domain-specific audit category.

### FR-6: Certify Integration

When packs are installed, `/certify` gains a new category per pack:

```
/certify (with eu-vat pack installed)

  Category Scores:
    ✓ security           100/100
    ✓ documentation      100/100
    ...
    ✓ eu-vat-compliance   85/100  ← NEW: pack-provided validation
```

### FR-7: Smart Router Integration

The smart router should detect domain context from task descriptions:

```
/route "implement VAT calculation for Luxembourg digital services"
  → Agent: coder
  → Domain pack: eu-vat (auto-loaded)
  → Relevant rules: EU-VAT-001, EU-VAT-023, EU-VAT-LU-001
```

---

## Non-Functional Requirements

### NFR-1: Legal Disclaimer

Every pack MUST include a disclaimer:
> "This knowledge pack is for development reference only. It does not constitute legal, tax, or financial advice. Always consult qualified professionals for production implementations. Rules may be outdated — verify against current legislation."

This disclaimer MUST appear in:
- `pack.json` metadata
- `reference.md` header
- Every `/domain explain` response
- Every `/domain validate` report

### NFR-2: Source Citations

Every rule MUST have:
- `source` — legislation name, article number
- `source_url` — link to official publication (preferably EUR-Lex, legislation.gov.uk, etc.)
- `last_verified` — date the rule was last checked against source
- `confidence` — level of certainty

Rules without citations MUST be flagged as `confidence: "community_knowledge"`.

### NFR-3: Jurisdiction Awareness

Packs MUST specify jurisdiction. Rules MUST indicate which jurisdictions they apply to. The engine MUST warn when applying rules outside their jurisdiction.

### NFR-4: Version Control

Pack rules change when laws change. Packs MUST:
- Use semantic versioning
- Include CHANGELOG.md
- Mark deprecated rules (not delete them)
- Include `effective_date` and `expiry_date` where applicable

### NFR-5: Offline-First

All pack data is local (JSONL files, no API calls). The engine works fully offline after pack installation. Updates are opt-in.

### NFR-6: Performance

- Rule lookup: <50ms for exact match, <200ms for keyword search
- Pack loading: <500ms for largest pack (1000+ rules)
- Validation: <2s per file

---

## Initial Pack Roadmap

### Phase 1 Packs (based on current projects)

| Pack | Rules Est. | Priority | Relevance |
|------|-----------|----------|-----------|
| **eu-vat** | 150+ | P0 | taxnavigator, efiscalease |
| **gdpr** | 80+ | P0 | All EU apps, regforge |
| **aml-kyc** | 100+ | P1 | regforge, banking apps |

### Phase 2 Packs

| Pack | Rules Est. | Priority | Relevance |
|------|-----------|----------|-----------|
| **mifid-ii** | 120+ | P1 | Trading dashboards, MNQ journal |
| **psd2** | 60+ | P1 | Payment processing |
| **banking-eu** | 80+ | P2 | Banking apps |

### Phase 3 Packs (community-driven)

| Pack | Rules Est. | Priority | Relevance |
|------|-----------|----------|-----------|
| **iso-27001** | 100+ | P2 | Security compliance |
| **sox** | 70+ | P2 | Financial reporting |
| **hipaa** | 60+ | P3 | Healthcare (US market) |
| **pci-dss** | 50+ | P3 | Payment card handling |

---

## Technical Specifications

### Data Model

```
packs/
├── eu-vat/
│   ├── pack.json
│   ├── rules.jsonl           (structured rules)
│   ├── reference.md          (human-readable guide)
│   ├── glossary.md
│   ├── matrices/
│   │   ├── standard-rates.json
│   │   ├── reduced-rates.json
│   │   └── thresholds.json
│   ├── examples/
│   │   ├── calculate-vat.ts
│   │   ├── reverse-charge.ts
│   │   └── oss-scheme.md
│   ├── validators/
│   │   └── validate.ts
│   ├── SOURCES.md
│   └── CHANGELOG.md
```

### Core Module

```
sf_cli/src/core/domain-engine.ts
  ├── loadPack(name: string): Pack
  ├── searchRules(query: string, packs?: string[]): Rule[]
  ├── getRuleById(id: string): Rule | null
  ├── getMatrix(pack: string, name: string): MatrixData
  ├── validateFile(filePath: string, pack: string): DomainViolation[]
  ├── generateDomainPrd(description: string, packs: string[]): string
  └── formatExplainResponse(rules: Rule[]): string

sf_cli/src/commands/domain.ts
  └── SlashCommand implementation with subcommand routing

sf_cli/src/core/domain-pack-manager.ts
  ├── installPack(name: string): void
  ├── updatePack(name: string): void
  ├── listInstalledPacks(): PackInfo[]
  └── getPackInfo(name: string): PackInfo
```

### Search Algorithm

Rule search uses weighted keyword matching:
1. Exact match on `id` → weight 10
2. Exact match on `title` → weight 8
3. Keyword match on `tags` → weight 5
4. Keyword match on `rule` text → weight 3
5. Keyword match on `details` → weight 1

Results sorted by total weight, top 10 returned.

### Storage

- Packs stored in `packs/` directory (git-tracked)
- Pack index in `packs/index.json` (list of installed packs)
- Rule search index built on first load, cached in memory
- No external database needed (JSONL is the database)

---

## Constraints & Assumptions

### In Scope
- Pack format specification and tooling
- `/domain` command with all subcommands
- 3 initial packs (eu-vat, gdpr, aml-kyc)
- Integration with `/certify` and `/route`
- Offline-first, JSONL-based storage
- Source citations for all rules

### Out of Scope
- Real-time regulatory updates (manual update cycle)
- Legal advice or professional certification
- Jurisdiction-specific legal interpretation
- Natural language understanding of legislation (rules are manually curated)
- Pack marketplace or community submissions (Phase 3+)
- Multi-language pack content (English only for v1)

### Assumptions
- Rules are curated by developers, not lawyers (disclaimer required)
- Pack updates happen on a quarterly cycle (laws don't change daily)
- Users install only the packs relevant to their domain
- Validators check patterns, not semantic correctness

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Rules become outdated after law changes | Medium | `last_verified` field + quarterly review cycle + CHANGELOG |
| Users treat pack content as legal advice | High | Mandatory disclaimer on every output + `SOURCES.md` for verification |
| Pack curation is labor-intensive | Medium | Start with 3 packs for domains we actively work in; community contributions later |
| Rule search produces irrelevant results | Low | Weighted scoring + jurisdiction filtering + tag-based narrowing |
| Validator false positives on code patterns | Medium | Same approach as certification engine: context-aware scanning, exclusion lists |

---

## Success Criteria

- [ ] `/domain explain "VAT reverse charge"` returns accurate, cited answer within 200ms
- [ ] `/domain validate` catches at least 5 real domain violations in taxnavigator codebase
- [ ] `/domain prd "EU fintech payment platform"` produces PRD with 10+ regulatory requirements
- [ ] `/domain matrix "EU VAT rates"` returns 27-country rate table
- [ ] 3 packs installed and functional: eu-vat, gdpr, aml-kyc
- [ ] Integration with `/certify` adds domain-specific audit category
- [ ] Zero hallucinated rules — every rule has a `source` citation
- [ ] All pack content works fully offline

---

## Open Questions

1. Should packs be installable from a remote registry (like npm) or git repos only?
2. Should we support pack dependencies (e.g., `aml-kyc` depends on `gdpr`)?
3. How do we handle conflicting rules across jurisdictions (e.g., LU vs DE VAT exceptions)?
4. Should validators run automatically during `/forge` or only on explicit `/domain validate`?
5. Should pack contributions be accepted from the community? If so, what quality gate?

---

*This PRD is ready for `/go` when you decide to implement. Start with Phase 1 (pack format + `/domain` command + eu-vat pack).*

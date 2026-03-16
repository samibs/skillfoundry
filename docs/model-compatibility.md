# Model Compatibility Matrix

> Which AI models work with SkillFoundry, and what to expect from each.

---

## Quick Answer

| Tier | Models | What Works | What Doesn't |
|------|--------|------------|--------------|
| **Tier 1 (Recommended)** | Claude Opus 4, Claude Sonnet 4, GPT-4o, Grok-3 | Everything — full pipeline, all gates, autonomous mode | — |
| **Tier 2 (Capable)** | Claude Haiku 4.5, Gemini 2.5 Flash, GPT-4o-mini | Individual skills, basic pipeline, most gates | Complex multi-story pipelines may need retries |
| **Tier 3 (Limited)** | Llama 3.1 (70B+), Qwen 2.5 Coder (32B+) | Individual skills, simple code tasks, Q&A | Quality gates, multi-agent orchestration, complex reasoning |
| **Tier 4 (Basic)** | Llama 3.1 (8B), Qwen 2.5 Coder (7B), small local models | Simple edits, code completion, basic Q&A | Most pipeline features, gate enforcement, structured output |

---

## Detailed Compatibility

### Tier 1: Full Pipeline Support (Recommended)

These models reliably follow complex multi-step agent prompts, produce structured output, and pass quality gates consistently.

| Model | Provider | Pipeline | Gates (T0-T6) | Micro-Gates | Autonomous Mode | Tool Use |
|-------|----------|----------|---------------|-------------|-----------------|----------|
| Claude Opus 4.6 | Anthropic | ✅ Full | ✅ All pass | ✅ All | ✅ Reliable | ✅ Native |
| Claude Sonnet 4 | Anthropic | ✅ Full | ✅ All pass | ✅ All | ✅ Reliable | ✅ Native |
| GPT-4o | OpenAI | ✅ Full | ✅ All pass | ✅ All | ✅ Reliable | ✅ Native |
| Grok-3 | xAI | ✅ Full | ✅ All pass | ✅ All | ✅ Reliable | ✅ Native |

**Best for:** Full `/forge` pipeline, `/go`, `/goma`, multi-story implementations, security audits, architecture reviews.

### Tier 2: Individual Skills + Basic Pipeline

These models handle individual agent skills well and can run basic pipelines, but may struggle with complex multi-story orchestration or fail intermittent gates.

| Model | Provider | Pipeline | Gates (T0-T6) | Micro-Gates | Autonomous Mode | Tool Use |
|-------|----------|----------|---------------|-------------|-----------------|----------|
| Claude Haiku 4.5 | Anthropic | ⚠️ Basic | ✅ T0-T4 | ⚠️ MG0-MG1 | ⚠️ Simple intents | ✅ Native |
| Gemini 2.5 Flash | Google | ⚠️ Basic | ✅ T0-T4 | ⚠️ MG0-MG1 | ⚠️ Simple intents | ✅ Native |
| GPT-4o-mini | OpenAI | ⚠️ Basic | ✅ T0-T4 | ⚠️ MG0-MG1 | ⚠️ Simple intents | ✅ Native |

**Best for:** `/coder`, `/tester`, `/review`, single-story implementations, code explanation, debugging.

**Limitations:**
- Multi-story pipelines may lose context between stories
- MG2 (standards review) and MG3 (cross-story review) produce lower-quality assessments
- T5 (build) and T6 (scope) may need manual intervention
- Autonomous mode works for simple FEATURE/BUG intents but may misclassify complex requests

### Tier 3: Individual Skills Only (Local Large Models)

Larger local models can handle individual coding tasks but lack the instruction-following precision needed for multi-agent orchestration.

| Model | Provider | Pipeline | Gates | Micro-Gates | Autonomous Mode | Tool Use |
|-------|----------|----------|-------|-------------|-----------------|----------|
| Llama 3.1 70B | Ollama | ❌ | ⚠️ T0-T2 | ❌ | ❌ | ⚠️ Partial |
| Qwen 2.5 Coder 32B | LM Studio | ❌ | ⚠️ T0-T2 | ❌ | ❌ | ⚠️ Partial |
| Mixtral 8x22B | Ollama | ❌ | ⚠️ T0-T2 | ❌ | ❌ | ⚠️ Partial |
| DeepSeek Coder V2 | Ollama | ❌ | ⚠️ T0-T2 | ❌ | ❌ | ⚠️ Partial |

**Best for:** `/coder` for single-file tasks, code completion, simple Q&A, code review of small files.

**Limitations:**
- Cannot follow complex multi-step agent prompts reliably
- Tool use is inconsistent (may produce malformed tool calls)
- Quality gates that require structured JSON output often fail
- No support for pipeline orchestration or autonomous mode
- Context windows (4K-32K) limit multi-file understanding

### Tier 4: Basic Tasks Only (Local Small Models)

Small local models work for simple edits and completions but should not be used for any pipeline or gate features.

| Model | Provider | Pipeline | Gates | Micro-Gates | Autonomous Mode | Tool Use |
|-------|----------|----------|-------|-------------|-----------------|----------|
| Llama 3.1 8B | Ollama | ❌ | ❌ | ❌ | ❌ | ❌ |
| Qwen 2.5 Coder 7B | LM Studio | ❌ | ❌ | ❌ | ❌ | ❌ |
| Phi-3 Mini | Ollama | ❌ | ❌ | ❌ | ❌ | ❌ |
| CodeLlama 7B | Ollama | ❌ | ❌ | ❌ | ❌ | ❌ |

**Best for:** Code completion, simple single-file edits, syntax help.

**Limitations:**
- Cannot follow agent prompts at all
- No tool use support
- Very limited context windows
- Output quality insufficient for production code generation

---

## Feature Requirements by Model Tier

| Feature | Minimum Tier | Why |
|---------|-------------|-----|
| `/forge` full pipeline | Tier 1 | Multi-story orchestration requires precise prompt following |
| `/go` PRD-to-implementation | Tier 1 | Story generation + implementation + gate enforcement |
| `/goma` autonomous mode | Tier 1 | Intent classification + pipeline routing |
| `/coder` implementation | Tier 2 | Single-agent code generation |
| `/tester` test generation | Tier 2 | Structured test output |
| `/review` code review | Tier 2 | Analytical reasoning |
| `/security` audit | Tier 1 | OWASP patterns + threat modeling requires strong reasoning |
| `/architect` design | Tier 1 | System-level reasoning |
| Quality gates (T0-T6) | Tier 1-2 | Structured output + tool use |
| Micro-gates (MG0-MG3) | Tier 1-2 | AI-powered review quality |
| Memory recall | Tier 2 | Context integration |
| Budget controls | Any | Provider-level feature, not model-dependent |
| Local-first routing | Tier 3-4 (local) + Tier 1-2 (fallback) | Routes simple tasks locally, complex tasks to cloud |

---

## Configuring Gate Strictness

If you're using a Tier 2 model and experiencing frequent gate failures, you can relax non-critical gates:

```toml
# .skillfoundry/config.toml

[gates]
# Skip specific tiers (use with caution)
skip_tiers = ["T5", "T6"]          # Skip build and scope validation

# Reduce micro-gate strictness
micro_gate_level = "essential"      # "full" (default) | "essential" (MG0-MG1 only) | "off"

# Allow more fixer retries for weaker models
max_fixer_retries = 5               # default: 3
```

**Warning:** Relaxing gates reduces code quality guarantees. Only do this if you understand the trade-offs.

---

## Recommendations

### For Teams / Production Work
Use **Tier 1 models** (Claude Sonnet 4, GPT-4o, Grok-3). The quality gates are designed to catch AI mistakes — weaker models make more mistakes, which means more gate failures and more fixer retries, which costs more tokens in the long run.

### For Individual Developers / Learning
Start with **Tier 2 models** for cost efficiency. Use individual skills (`/coder`, `/review`, `/tester`) rather than full pipeline. Upgrade to Tier 1 when running `/forge` or `/go`.

### For Offline / Air-Gapped Development
Use **local-first routing** with a Tier 3 local model + Tier 1 cloud fallback. Simple tasks stay local and free; complex tasks fall back to cloud.

```toml
# .skillfoundry/config.toml
route_local_first = true
local_provider = "ollama"
local_model = "llama3.1"
provider = "anthropic"
model = "claude-sonnet-4-20250514"
```

### Cost-Optimized Setup
Use Tier 2 for day-to-day work, Tier 1 for pipeline runs:

```toml
# .skillfoundry/config.toml
provider = "anthropic"
model = "claude-haiku-4-5-20251001"     # Tier 2 for interactive use

[pipeline]
model_override = "claude-sonnet-4-20250514"  # Tier 1 for /forge and /go
```

---

## CLI Warnings

The `sf` CLI automatically detects your configured model's tier and warns when capabilities may be limited:

```
⚠  Model "llama3.1" (Tier 3) has limited support for pipeline features.
   Recommended: Use a Tier 1 model (claude-sonnet-4, gpt-4o, grok-3) for /forge.
   See: docs/model-compatibility.md
```

Warnings appear once per session and can be suppressed:

```toml
# .skillfoundry/config.toml
suppress_tier_warnings = false    # set to true to suppress
```

---

## Further Reading

- **[Attention Residuals — Architecture Research Note](knowledge/ai-architecture/attention-residuals.md)** — Why the execution tier is getting smarter per FLOP (AttnRes, mHC, depth-attention architectures)
- **[Local Model Selection — Execution Tier Guide](knowledge/ai-architecture/local-model-selection.md)** — Architecture signals, routing logic, hardware guidance, and `model-routing.yaml` config for local-first deployment

# Local Model Selection — SkillFoundry Execution Tier

**Last updated:** March 2026  
**Related research:** `knowledge/ai-architecture/attention-residuals.md`

---

## The Two-Tier Philosophy

SkillFoundry treats LLM access as a tiered compute resource:

```
TIER 1 — Frontier (Cloud)
  Claude Opus / Sonnet, GPT-4o, Gemini Ultra
  → Planning, orchestration, complex reasoning, user-facing synthesis
  → High cost, high capability, data leaves jurisdiction

TIER 2 — Execution (Local)
  Kimi / Qwen / Mistral / Phi / Llama derivatives
  → Task execution, code gen, classification, retrieval, tool calls
  → Low cost, acceptable capability, data stays local
```

The senior writes the spec. The junior executes it.  
**The junior tier is getting significantly better, faster than the frontier tier's cost is falling.**

---

## Architecture Signals to Prefer (2026)

When evaluating or selecting a local execution model, prefer:

| Signal | Why it matters |
|---|---|
| **AttnRes / Block AttnRes architecture** | Better inter-layer information flow → stronger multi-step reasoning per activated parameter |
| **mHC (DeepSeek multi-head connections)** | Same depth-attention principle, higher memory bandwidth but comparable gains |
| **MoE with low activation ratio** | 3–5B activated from 30–48B total → frontier-class quality at local-runnable cost |
| **GPQA-Diamond > 40** | Proxy for PhD-level multi-step reasoning. If the model can handle this, it handles most execution tasks |
| **Open weights + Apache / MIT license** | Required for production deployment in regulated environments (GDPR, AI Act) |

### Current reference models (March 2026)

```yaml
execution_models:
  - name: Kimi K1.5 (Block AttnRes)
    activated_params: 3B
    total_params: 48B
    gpqa_diamond: 44.4
    architecture: MoE + AttnRes
    licence: open
    local_viable: true
    
  - name: Qwen2.5-Coder-7B
    activated_params: 7B
    total_params: 7B
    licence: Apache-2.0
    local_viable: true
    strength: code generation

  - name: DeepSeek-R1-Distill-Qwen-7B
    activated_params: 7B
    total_params: 7B
    licence: MIT
    local_viable: true
    strength: reasoning
```

---

## Routing Decision Logic

```python
def route_task(task: Task, context: Context) -> Tier:
    """
    Determine whether a task goes to the local execution tier or frontier cloud.
    """
    
    # Always local: data jurisdiction constraints
    if context.gdpr_required or context.ai_act_scope:
        if local_model_meets_threshold(task):
            return Tier.LOCAL
        # If local can't handle it: block and escalate, don't silently cloud
        raise JurisdictionConflict(task)
    
    # Local-preferred: well-defined execution tasks
    if task.type in [TaskType.CODE_GEN, TaskType.CLASSIFICATION, 
                     TaskType.TRANSFORM, TaskType.RETRIEVAL]:
        if task.complexity_score < 7:  # 1–10 scale
            return Tier.LOCAL
    
    # Cloud-required: planning, synthesis, ambiguous specs
    if task.type in [TaskType.PLANNING, TaskType.ORCHESTRATION,
                     TaskType.COMPLEX_REASONING, TaskType.USER_FACING_SYNTHESIS]:
        return Tier.CLOUD
    
    # Default: local first, fallback to cloud on quality gate failure
    return Tier.LOCAL_WITH_CLOUD_FALLBACK


def local_model_meets_threshold(task: Task) -> bool:
    """
    Check if the current local model can handle the task type.
    Benchmarks stored in models/registry.yaml.
    """
    model = get_local_model()
    benchmark = TASK_TYPE_BENCHMARKS[task.type]
    return model.scores.get(benchmark.name, 0) >= benchmark.minimum_score
```

---

## Why Open-Source Chinese Labs Drive This Tier

Three structural reasons:

1. **No US cloud market access** → incentive to publish open weights that others run locally
2. **GDPR + AI Act** (EU) → creates enterprise demand for local inference on open models  
3. **Architecture innovation** (AttnRes, mHC, MLA) → consistently narrows the gap with frontier models

The convergence of supply (open weights from Chinese labs) and demand (regulatory pressure in EU) makes the local execution tier a structural bet, not a preference.

---

## Hardware Guidance

For SkillFoundry local execution:

| Hardware | Max viable model size | Notes |
|---|---|---|
| RTX 4070 (12GB VRAM) | 7B dense / 10B MoE activated | Q4 quantisation required for 7B |
| RTX 4090 (24GB VRAM) | 13B dense / 30B MoE activated | Q4 for 13B, Q8 for 7B |
| Mac M3 Pro (36GB unified) | 13B dense / 30B MoE activated | MLX backend preferred |
| 2× A6000 (96GB VRAM) | 70B dense | Q4, sufficient for most tasks |

**Recommended stack:**  
`llama.cpp` (GGUF) or `ollama` for serving · `LiteLLM` for unified routing API · `OpenAI-compatible endpoint` for SkillFoundry agent compatibility

---

## Integration with SkillFoundry Agent Routing

```yaml
# skillfoundry/config/model-routing.yaml

routing:
  default_execution_model: ollama/kimi-k1.5-3b-q4
  default_planning_model: anthropic/claude-sonnet-4-20250514
  
  rules:
    - condition: task.data_classification == "confidential"
      force: local
    - condition: task.type == "code_generation" and task.complexity < 6
      prefer: local
    - condition: task.type == "orchestration"
      force: cloud
    - condition: local_model.quality_score < 0.7
      fallback: cloud
      
  quality_gate:
    enabled: true
    metric: self_consistency_score
    threshold: 0.7
    sample_n: 3
```

---

## Changelog

| Date | Change |
|---|---|
| March 2026 | Added AttnRes architecture signal; updated reference models with Kimi K1.5 |
| Feb 2026 | Initial version; basic local/cloud split documented |

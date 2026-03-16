# Attention Residuals (AttnRes) — Architecture Research Note

**Source:** Moonshot AI (Kimi team)  
**Published:** March 2026  
**Relevance:** Local model efficiency · Execution agent model selection · Cloud vs. local routing

---

## TL;DR for SkillFoundry

> A new architectural brick replaces classical residual connections with attention-based ones across the depth axis of the network. Result: models that learn better, stay stable, and do more with fewer activated parameters.  
> **For SkillFoundry:** validates and strengthens the senior-delegates-to-junior pattern. The execution tier models are getting meaningfully smarter per compute dollar.

---

## Context: Why Residual Connections Matter

Every modern LLM (GPT, Claude, Llama, Qwen, Kimi) is a Transformer — a stack of layers, each doing two things:
1. **Attention block** — mixes information across tokens (context understanding)
2. **MLP block** — transforms each token independently (local reasoning)

Between layers, a **residual connection** adds the layer's output back to its input with a fixed weight of `1`. This is what allows very deep networks to train without losing signal — the "backbone" of all deep learning since 2016.

**The hidden problem:** every layer receives the same uniform blend of all previous layers. No selectivity. Contributions from early layers gradually drown in the accumulation of later ones (the **dilution problem**). Consequence: deep layers have to "shout louder" (produce increasingly large outputs) just to stay audible — wasting capacity and destabilising training.

Empirical evidence: researchers have shown you can delete entire layers from some deep models without significant performance loss. Those layers had already stopped contributing.

---

## What Attention Residuals Does

**The key insight from Moonshot:** residual connections make the same mistake as RNNs, but on a different axis.

| Old problem (solved by Transformers) | New problem (solved by AttnRes) |
|---|---|
| Compressing a sequence of *words* into a single vector | Compressing a sequence of *layers* into a single state |
| Fixed-weight blending over the time axis | Fixed-weight blending over the depth axis |

**AttnRes solution:** each layer gets a small learned query vector and uses it to *attend* over all previous layers' outputs — exactly like standard attention over tokens, but applied between layers.

- Layers that are relevant get high weight
- Others are attenuated
- The softmax forces competitive allocation (a layer must earn its attention weight)
- Cost: negligible — a model has ~hundreds of layers vs. millions of tokens

### Block AttnRes (production variant)

Full AttnRes stores all layer outputs — memory-heavy at scale. Block AttnRes solves this by:
- Grouping layers into ~8 blocks
- Summarising each block into one representation (classic addition)
- Attending only over the 8 block summaries, not all individual layers

Overhead: **<4% training cost, <2% inference latency**. Drop-in replacement for residual connections.

---

## Measured Gains (Kimi — 3B activated / 48B total parameters)

| Benchmark | Before | After | Delta |
|---|---|---|---|
| GPQA-Diamond (PhD-level reasoning) | 36.9 | 44.4 | **+7.5** |
| Math | 53.5 | 57.1 | +3.6 |
| HumanEval (code) | 59.1 | 62.2 | +3.1 |
| MMLU (general knowledge) | 73.5 | 74.6 | +1.1 |
| BBH (logical reasoning) | 76.3 | 78.0 | +1.7 |

Largest gains on multi-step reasoning — exactly where better inter-layer information flow matters most.

**Training efficiency:** Block AttnRes reaches the same performance as a baseline model trained with 25% more compute. Same budget → better model.

---

## AttnRes vs. DeepSeek mHC

Two labs, same diagnosis, different approaches:

| | DeepSeek mHC | Moonshot AttnRes |
|---|---|---|
| **Strategy** | Widen the pipe (4 parallel residual streams, doubly stochastic mixing) | Give each layer eyes to look back (attention over depth) |
| **Memory bandwidth** | High (4 streams maintained) | ~6× lower (8 block summaries + small query vector) |
| **Performance** | Comparable | Comparable |
| **Conceptual framing** | More bandwidth | More selectivity |

Moonshot's paper shows both are special cases of depth-axis attention (linear vs. full softmax) — the same leap that separated RNNs from Transformers.

---

## Key Architectural Findings

- **Fixed weights between layers = no gain.** The content-adaptive weighting (softmax over depth) is what drives improvement. Static weighted combinations (DenseFormer) add nothing.
- **Softmax > sigmoid.** Competitive allocation forces the network to rank layers. Independent per-layer scores don't generalise as well.
- **Multi-head attention over depth degrades results.** A layer is relevant or not as a whole. Splitting it into dimensional sub-groups loses coherence.
- **Optimal shape shifts.** Models using AttnRes benefit from being *deeper and narrower* than equivalent baseline models — AttnRes extracts more value from depth.
- **Learned weight patterns:** each layer relies most on its immediate neighbour, but the initial token encoding maintains significant weight all the way to the final layers, especially in attention blocks. Long-range skip connections emerge naturally.

---

## SkillFoundry Implications

### 1. Execution agent model selection

When selecting the local execution model (the "junior" tier in the senior-delegates-to-junior pattern):

```yaml
# Prefer models with depth-optimised architectures
preferred_architectures:
  - AttnRes (Moonshot/Kimi)
  - mHC (DeepSeek)
  - MoE with low activation ratio (<10% parameters per request)

selection_signal:
  - GPQA-Diamond score > 40 → multi-step reasoning capable
  - Activated params < 5B → local-viable on consumer hardware
  - Architecture: depth-attention variant → more efficient per FLOP
```

### 2. Reinforces the tiered routing model

The article validates the `frontier-for-planning / local-for-execution` split:

```
Claude Opus / Sonnet  →  instruction writing, complex reasoning, orchestration
Kimi K1.5 / Qwen / local AttnRes model  →  task execution, code generation, retrieval
```

The gap between frontier and local is narrowing faster than cost-per-token. AttnRes is one reason why.

### 3. Knowledge basis for the local-vs-cloud routing skill

When the routing agent evaluates whether a task goes local or cloud:

```
LOCAL if:
  - Task is execution of a well-defined spec (code gen, transform, classification)
  - Data must not leave jurisdiction (GDPR / AI Act context)
  - Latency budget < 500ms
  - Model benchmark on task type > threshold (use GPQA-Diamond proxy for reasoning depth)

CLOUD if:
  - Task requires frontier-level planning or multi-domain synthesis
  - Output feeds a user-facing response with brand/quality risk
  - No local model meets the benchmark threshold for the task type
```

### 4. Open-source momentum signal

Moonshot (private Chinese lab, no access to US cloud market) → publishes full paper + code + architecture.  
DeepSeek → same pattern.  
Qwen (Alibaba) → same pattern.

SkillFoundry's local-first thesis is not a niche bet — it is aligned with the structural incentive of the largest model labs outside the US frontier.

---

## References

- Moonshot AI, *Attention Residuals*, March 2026
- DeepSeek, *mHC: Multi-Head Connections*, January 2026
- He et al., *Deep Residual Learning*, 2016 (original residual connections)
- Vaswani et al., *Attention Is All You Need*, 2017 (original Transformer)

# PRD: Local Vector Memory

---
prd_id: local-vector-memory
title: Local Vector Memory
version: 1.0
status: DRAFT
created: 2026-05-05
author: Gemini CLI
last_updated: 2026-05-05

# DEPENDENCIES (for inter-PRD coordination)
dependencies:
  requires: []        
  recommends: []      
  blocks: []          
  shared_with: []     

tags: [memory, core, feature, ai]
priority: high
layers: [backend, core-engine]
---

---

## 1. Overview

### 1.1 Problem Statement
The current SkillFoundry memory system relies on exact keyword matching and manual weights. As projects grow, agents suffer from "retrieval noise"—failing to find relevant historical decisions because they used slightly different terminology (e.g., searching for "Auth" but missing lessons tagged with "Session Management").

### 1.2 Proposed Solution
Implement a **Local-First Vector Index** for the `memory_bank/`. This involves generating embeddings for every knowledge entry and performing semantic search (Cosine Similarity) alongside keyword matching. This allows for "fuzzy" retrieval that understands the technical intent, not just the words.

### 1.3 Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Retrieval Relevance (mAP) | ~60% (keyword) | > 85% | Benchmarking against a set of "Related but No Keyword Match" queries |
| Discovery of Related Context | Low | High | Measure number of cross-domain memory entries pulled per session |
| Performance Overhead | 0ms | < 200ms | Retrieval latency in the CLI |

---

## 2. User Stories

### Primary User: AI Developer Agent

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | AI Developer | Retrieve relevant lessons even if I don't use the exact keywords | I can benefit from the full depth of the project's knowledge base. | MUST |
| US-002 | AI Developer | Rank results by semantic similarity | I see the most conceptually related items first. | MUST |
| US-003 | AI Developer | Index new knowledge in real-time | My very next action can benefit from what I just learned. | SHOULD |

---

## 3. Functional Requirements

### 3.1 Core Features

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-001 | Embedding Generation | Generate 768-1536d vectors for JSONL entries using local models. | Every new `memory_bank` entry gets an associated vector. |
| FR-002 | Semantic Search | Perform Cosine Similarity search on the vector index. | Searching for "Encryption" returns "Hashing" and "Salting" results. |
| FR-003 | Hybrid Retrieval | Combine keyword score and vector similarity score. | Results are weighted by both exact and semantic relevance. |
| FR-004 | Local Persistence | Store the vector index locally (e.g., `vector.index`). | Index survives session restarts without full re-embedding. |

---

## 5. Technical Specifications

### 5.0 Technology Maturity Assessment

| Dependency | Version | Maturity | API Stability | Known Quirks in KB | Verification Required |
|-----------|---------|----------|--------------|-------------------|----------------------|
| Transformers.js | ^3.0.0 | Stable | Stable | Heavy initialization time | Unit tests |
| HNSWLib (local) | ^1.0.0 | Stable | Stable | Index lock on parallel writes | Integration tests |

### 5.7 Environment Variables

| Variable | Example / Format | Generation Method | Required | Notes |
|----------|-----------------|-------------------|----------|-------|
| MEMORY_EMBEDDING_MODEL | `all-MiniLM-L6-v2` | Manual | No | Local model identifier |
| MEMORY_VECTOR_DIM | `384` | Manual | No | Matches model output dimensions |

---

## 10. Acceptance Criteria

### 10.1 Definition of Done

- [ ] Embedding service implemented in `sf_cli/src/core/embedding-service.ts`.
- [ ] Vector store (HNSW or flat-file) implemented in `sf_cli/src/core/vector-store.ts`.
- [ ] Hybrid search logic integrated into `layered-recall.ts`.
- [ ] Verified semantic retrieval: "Auth" search pulls "OAuth", "JWT", and "Permissions".
- [ ] No significant performance regression in CLI startup/response.

/**
 * Code Map — optional LLM semantic labels (STORY-012).
 *
 * STRICTLY ADDITIVE and NON-AUTHORITATIVE. Off by default (no provider call
 * unless explicitly enabled). Labels are stamped `confidence:"llm-hint"` and MUST
 * NOT be used to satisfy Three-Layer "REAL logic" verification. The labeler is
 * injected (dependency injection) so the orchestration is testable without a
 * live provider; `defaultLabeler()` wires the real one.
 */

import Anthropic from "@anthropic-ai/sdk";
import { type CodeMap, type CodeNode } from "./graph.js";

/** Fact-only descriptor sent to the labeler — never source contents or secrets. */
export interface NodeFact {
  id: string;
  kind: string;
  name: string;
  file: string;
  line: number;
}

export type Labeler = (facts: NodeFact[]) => Promise<Map<string, { summary?: string }>>;

const LABELABLE = new Set<CodeNode["kind"]>(["function", "method", "class", "model"]);

/**
 * Apply semantic labels to labelable nodes. Returns the number labeled.
 * Pure orchestration: the caller supplies the labeler.
 */
export async function applySemanticLabels(
  map: CodeMap,
  labeler: Labeler,
  opts?: { batchSize?: number },
): Promise<number> {
  const batchSize = opts?.batchSize ?? 40;
  const targets = map.nodes.filter((n) => LABELABLE.has(n.kind));
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  let labeled = 0;

  for (let i = 0; i < targets.length; i += batchSize) {
    const batch = targets.slice(i, i + batchSize);
    const facts: NodeFact[] = batch.map((n) => ({ id: n.id, kind: n.kind, name: n.name, file: n.file, line: n.line }));
    const result = await labeler(facts);
    for (const [id, label] of result) {
      const node = byId.get(id);
      if (!node || !label.summary) continue;
      node.summary = label.summary;
      node.confidence = "llm-hint"; // non-authoritative marker
      labeled++;
    }
  }
  return labeled;
}

/**
 * Real labeler backed by the Anthropic SDK. Throws if no provider is configured
 * (caller catches → reports "semantic unavailable"). Sends fact-only descriptors.
 */
export function defaultLabeler(): Labeler {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("no LLM provider configured (set ANTHROPIC_API_KEY)");
  const client = new Anthropic({ apiKey });

  return async (facts: NodeFact[]) => {
    const out = new Map<string, { summary?: string }>();
    const prompt =
      "For each code symbol below, write a concise one-line plain-English summary of its likely purpose, " +
      'inferred ONLY from its name/kind/path. Respond as a JSON array of {"id","summary"}. Symbols:\n' +
      JSON.stringify(facts);
    const resp = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
    const text = resp.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    try {
      const arr = JSON.parse(text) as { id: string; summary: string }[];
      for (const item of arr) out.set(item.id, { summary: item.summary });
    } catch {
      /* model returned non-JSON — emit no labels rather than guessing */
    }
    return out;
  };
}

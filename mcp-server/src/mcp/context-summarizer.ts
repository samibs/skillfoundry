/**
 * Context Summarizer — LLM-powered summarization of pruned conversation context.
 *
 * Inspired by Hermes Agent's context_compressor.py. Instead of a mechanical
 * "[N messages omitted]" placeholder, uses Haiku (cheapest model) to generate
 * a semantic summary of pruned messages, preserving decisions, tool results,
 * and key findings that the sliding window would otherwise discard.
 *
 * Cost: ~$0.0003 per summarization call (200 input + 200 output tokens on Haiku).
 * Value: Preserves context that prevents the agent from repeating work or
 * contradicting earlier decisions.
 */

import Anthropic from "@anthropic-ai/sdk";

// ── Types ─────────────────────────────────────────────────────────────

export interface PrunedMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SummarizationResult {
  summary: string;
  prunedCount: number;
  summaryTokens: number;
  wasLlmGenerated: boolean;
}

// ── Summarizer ────────────────────────────────────────────────────────

const SUMMARY_SYSTEM_PROMPT = `You are a context summarizer. Given a sequence of conversation messages that are being pruned from context, produce a concise summary that preserves:

1. Key decisions made (what was chosen and why)
2. Important tool/command results (pass/fail, key findings)
3. Files modified or created
4. Errors encountered and how they were resolved
5. Current state of work (what's done, what's pending)

Rules:
- Be extremely concise — target 150-200 tokens maximum
- Use bullet points, not prose
- Preserve exact file paths, version numbers, and error messages
- Skip pleasantries, greetings, and filler
- Focus on facts that would prevent rework if lost`;

const CHARS_PER_TOKEN = 3.5;

/**
 * Extract text content from a message (handles string or content blocks).
 */
function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block: Record<string, unknown>) => {
        if (block.type === "text" && typeof block.text === "string") return block.text;
        if (block.type === "tool_use") return `[tool: ${block.name}]`;
        if (block.type === "tool_result" && typeof block.content === "string") {
          // Truncate large tool results for summarization input
          const text = block.content as string;
          return text.length > 500 ? text.slice(0, 500) + "..." : text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return String(content);
}

/**
 * Summarize pruned messages using Haiku for minimal cost.
 *
 * Falls back to a mechanical summary if:
 * - No API key is configured
 * - The LLM call fails
 * - The pruned content is too small to warrant summarization
 */
export async function summarizePrunedMessages(
  prunedMessages: PrunedMessage[],
): Promise<SummarizationResult> {
  const prunedCount = prunedMessages.length;

  // If fewer than 4 messages pruned, mechanical summary is fine
  if (prunedCount < 4) {
    return {
      summary: `[${prunedCount} earlier messages omitted — conversation compacted.]`,
      prunedCount,
      summaryTokens: Math.ceil(15 / CHARS_PER_TOKEN),
      wasLlmGenerated: false,
    };
  }

  // Build the content to summarize
  const conversationText = prunedMessages
    .map((msg) => {
      const text = extractText(msg.content);
      const prefix = msg.role === "user" ? "USER" : "ASSISTANT";
      // Cap each message at 800 chars to keep summarization input manageable
      const trimmed = text.length > 800 ? text.slice(0, 800) + "..." : text;
      return `${prefix}: ${trimmed}`;
    })
    .join("\n\n");

  // Cap total input to ~2000 tokens worth of chars
  const maxInputChars = 7000;
  const inputText =
    conversationText.length > maxInputChars
      ? conversationText.slice(0, maxInputChars) +
        `\n\n[... ${prunedCount} messages total, truncated for summarization]`
      : conversationText;

  // Try LLM summarization
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      summary: `[${prunedCount} earlier messages omitted — no API key for LLM summarization.]`,
      prunedCount,
      summaryTokens: Math.ceil(20 / CHARS_PER_TOKEN),
      wasLlmGenerated: false,
    };
  }

  try {
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: SUMMARY_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Summarize these ${prunedCount} pruned conversation messages. Preserve key decisions, results, and state:\n\n${inputText}`,
        },
      ],
    });

    const summaryText =
      response.content[0].type === "text" ? response.content[0].text : "";

    const formattedSummary = [
      `[Context Summary — ${prunedCount} earlier messages condensed by LLM]`,
      "",
      summaryText,
    ].join("\n");

    return {
      summary: formattedSummary,
      prunedCount,
      summaryTokens: Math.ceil(formattedSummary.length / CHARS_PER_TOKEN),
      wasLlmGenerated: true,
    };
  } catch (err) {
    // Fallback to mechanical summary on any LLM failure
    const fallback = `[${prunedCount} earlier messages omitted — LLM summarization failed: ${(err as Error).message?.slice(0, 80)}]`;
    return {
      summary: fallback,
      prunedCount,
      summaryTokens: Math.ceil(fallback.length / CHARS_PER_TOKEN),
      wasLlmGenerated: false,
    };
  }
}

/**
 * Generate a mechanical summary (no LLM call) for use in sync contexts.
 */
export function mechanicalSummary(prunedCount: number): string {
  return `[${prunedCount} earlier messages omitted. The conversation has been compacted to fit within the model's context window.]`;
}

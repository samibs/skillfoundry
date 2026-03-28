import { describe, it, expect } from "vitest";
import { evaluateEntry, applyGate, canPromote } from "../src/knowledge/memory-gate.js";

const baseEntry = {
  framework: "nextauth",
  versionRange: "5.x-beta",
  quirk: "signIn() with redirect: false drops session cookie",
  fix: "Use redirect: false + manual window.location.href + SessionProvider",
  evidenceSource: "playwright" as const,
  evidenceSummary: "Playwright test confirmed login redirects to /admin",
  discoveredAt: "2026-03-28T00:00:00Z",
};

describe("Memory Gate", () => {
  describe("evaluateEntry", () => {
    it("Playwright evidence → verified", () => {
      const decision = evaluateEntry(baseEntry, "playwright");
      expect(decision.confidence).toBe("verified");
      expect(decision.allowed).toBe(true);
    });

    it("Semgrep evidence → verified", () => {
      const decision = evaluateEntry(baseEntry, "semgrep");
      expect(decision.confidence).toBe("verified");
    });

    it("build evidence → verified", () => {
      const decision = evaluateEntry(baseEntry, "build");
      expect(decision.confidence).toBe("verified");
    });

    it("unit_test evidence → verified", () => {
      const decision = evaluateEntry(baseEntry, "unit_test");
      expect(decision.confidence).toBe("verified");
    });

    it("LLM reasoning → observed with warning", () => {
      const decision = evaluateEntry(baseEntry, "llm_reasoning");
      expect(decision.confidence).toBe("observed");
      expect(decision.reason).toContain("NOT been verified");
      expect(decision.reason).toContain("corrected 3 times");
    });

    it("curl for auth quirk → observed (browser required)", () => {
      const decision = evaluateEntry(baseEntry, "curl");
      expect(decision.confidence).toBe("observed");
      expect(decision.reason).toContain("browser behavior");
    });

    it("curl for non-auth quirk → observed", () => {
      const apiEntry = {
        ...baseEntry,
        quirk: "API returns 500 when database pool exhausted",
      };
      const decision = evaluateEntry(apiEntry, "curl");
      expect(decision.confidence).toBe("observed");
    });

    it("manual → observed", () => {
      const decision = evaluateEntry(baseEntry, "manual");
      expect(decision.confidence).toBe("observed");
    });
  });

  describe("applyGate", () => {
    it("returns complete entry with confidence applied", () => {
      const { entry, decision } = applyGate(baseEntry, "playwright");
      expect(entry.confidence).toBe("verified");
      expect(entry.framework).toBe("nextauth");
      expect(decision.allowed).toBe(true);
    });

    it("LLM entry gets observed confidence", () => {
      const { entry } = applyGate(baseEntry, "llm_reasoning");
      expect(entry.confidence).toBe("observed");
    });
  });

  describe("canPromote", () => {
    it("observed + Playwright → can promote to verified", () => {
      const observedEntry = { ...baseEntry, confidence: "observed" as const };
      const decision = canPromote(observedEntry, "playwright");
      expect(decision.allowed).toBe(true);
      expect(decision.confidence).toBe("verified");
    });

    it("observed + curl → cannot promote", () => {
      const observedEntry = { ...baseEntry, confidence: "observed" as const };
      const decision = canPromote(observedEntry, "curl");
      expect(decision.allowed).toBe(false);
      expect(decision.confidence).toBe("observed");
    });

    it("observed + llm_reasoning → cannot promote", () => {
      const observedEntry = { ...baseEntry, confidence: "observed" as const };
      const decision = canPromote(observedEntry, "llm_reasoning");
      expect(decision.allowed).toBe(false);
    });

    it("already verified → no promotion needed", () => {
      const verifiedEntry = { ...baseEntry, confidence: "verified" as const };
      const decision = canPromote(verifiedEntry, "playwright");
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain("Already verified");
    });
  });
});

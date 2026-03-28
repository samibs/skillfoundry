import { describe, it, expect } from "vitest";
import {
  routeAgent,
  routeByCategory,
  getRoutingTable,
  recordSpend,
  getTodaySpend,
  setDailyBudget,
  isWithinBudget,
} from "../src/agents/cost-router.js";

describe("Cost Router", () => {
  describe("routeAgent", () => {
    it("routes forge to opus (override)", () => {
      const decision = routeAgent("forge");
      expect(decision.tier).toBe("opus");
      expect(decision.reason).toContain("override");
    });

    it("routes coder to sonnet (category: generate)", () => {
      const decision = routeAgent("coder");
      expect(decision.tier).toBe("sonnet");
      expect(decision.reason).toContain("generate");
    });

    it("routes recall to haiku (category: search)", () => {
      const decision = routeAgent("recall");
      expect(decision.tier).toBe("haiku");
    });

    it("routes health to haiku (override)", () => {
      const decision = routeAgent("health");
      expect(decision.tier).toBe("haiku");
    });

    it("routes architect to opus (category: architect)", () => {
      const decision = routeAgent("architect");
      expect(decision.tier).toBe("opus");
    });

    it("routes unknown agent to sonnet (default)", () => {
      const decision = routeAgent("totally_unknown_agent");
      expect(decision.tier).toBe("sonnet");
      expect(decision.reason).toContain("Default");
    });
  });

  describe("routeByCategory", () => {
    it("routes search to haiku", () => {
      expect(routeByCategory("search").tier).toBe("haiku");
    });

    it("routes generate to sonnet", () => {
      expect(routeByCategory("generate").tier).toBe("sonnet");
    });

    it("routes architect to opus", () => {
      expect(routeByCategory("architect").tier).toBe("opus");
    });
  });

  describe("getRoutingTable", () => {
    it("returns routing for all known agents", () => {
      const table = getRoutingTable();
      expect(table.length).toBeGreaterThan(20);

      const forgeEntry = table.find((r) => r.agentName === "forge");
      expect(forgeEntry?.tier).toBe("opus");

      const coderEntry = table.find((r) => r.agentName === "coder");
      expect(coderEntry?.tier).toBe("sonnet");
    });
  });

  describe("Token Tracking", () => {
    it("records and reports spend", () => {
      recordSpend("haiku", 10000, 5000);
      recordSpend("sonnet", 5000, 2000);

      const spend = getTodaySpend();
      expect(spend.total).toBeGreaterThan(0);
      expect(spend.byTier.haiku).toBeGreaterThan(0);
      expect(spend.byTier.sonnet).toBeGreaterThan(0);
    });

    it("budget check works", () => {
      setDailyBudget(1000);
      expect(isWithinBudget()).toBe(true);

      setDailyBudget(0.00001);
      expect(isWithinBudget()).toBe(false);

      setDailyBudget(Infinity); // reset
    });
  });
});

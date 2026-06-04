import { describe, it, expect } from "vitest";
import path from "path";
import { assignLayer } from "../src/agents/codemap/layers.js";
import { parseFile, isSkip } from "../src/agents/codemap/parser.js";
import { extractModelsFromTree, extractPrismaModels } from "../src/agents/codemap/models.js";

const MODELS = path.join(import.meta.dirname, "fixtures/codemap/models");

describe("codemap layer heuristics (STORY-006)", () => {
  it("assigns deterministic layers from path + imports", () => {
    expect(assignLayer("prisma/schema.prisma", [])).toBe("db");
    expect(assignLayer("backend/migrations/001.py", [])).toBe("db");
    expect(assignLayer("src/models/user.ts", [])).toBe("db");
    expect(assignLayer("src/components/Button.tsx", ["react"])).toBe("frontend");
    expect(assignLayer("src/components/Button.tsx", [])).toBe("frontend");
    expect(assignLayer("src/app/users/route.ts", ["next/server"])).toBe("backend");
    expect(assignLayer("src/server/api.ts", ["express"])).toBe("backend");
    expect(assignLayer("api/handler.ts", [])).toBe("backend");
    expect(assignLayer("worker.py", [])).toBe("backend");
    expect(assignLayer("src/lib/format.ts", [])).toBe("shared");
  });

  it("treats a Next App Router route handler as backend, not frontend", () => {
    expect(assignLayer("src/app/users/route.ts", [])).toBe("backend");
  });
});

describe("codemap model extraction (STORY-006)", () => {
  it("parses Prisma models with their fields", async () => {
    const { nodes, edges } = await extractPrismaModels(MODELS, ["schema.prisma"]);
    const user = nodes.find((n) => n.name === "User");
    expect(user).toBeTruthy();
    expect(user!.kind).toBe("model");
    expect(user!.fields?.map((f) => f.name).sort()).toEqual(["email", "id", "name"]);
    expect(nodes.find((n) => n.name === "Post")).toBeTruthy();
    expect(edges.every((e) => e.kind === "declares-model")).toBe(true);
  });

  it("extracts Drizzle tables with field names", async () => {
    const parsed = await parseFile(path.join(MODELS, "drizzle.ts"));
    if (isSkip(parsed)) throw new Error("skip");
    const { nodes } = extractModelsFromTree("src/db/drizzle.ts", parsed);
    const users = nodes.find((n) => n.name === "users");
    expect(users).toBeTruthy();
    expect(users!.kind).toBe("model");
    expect(users!.fields?.map((f) => f.name).sort()).toEqual(["email", "id"]);
  });
});

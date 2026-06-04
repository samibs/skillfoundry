import { describe, it, expect } from "vitest";
import path from "path";
import { parseFile, isSkip } from "../src/agents/codemap/parser.js";
import { extractEndpoints, canonicalizePath } from "../src/agents/codemap/contract-extract.js";
import type { Endpoint } from "../src/agents/codemap/graph.js";

const DIR = path.join(import.meta.dirname, "fixtures/codemap/contract");

async function endpoints(file: string, repoRel: string): Promise<Endpoint[]> {
  const parsed = await parseFile(path.join(DIR, file));
  if (isSkip(parsed)) throw new Error(`skip ${file}`);
  return extractEndpoints(repoRel, parsed).endpoints;
}

const find = (eps: Endpoint[], method: string, p: string) =>
  eps.find((e) => e.method === method && e.path === p);

describe("codemap contract surface (STORY-005)", () => {
  it("canonicalizes path params across frameworks", () => {
    expect(canonicalizePath("/users/{id}")).toBe("/users/:id");
    expect(canonicalizePath("/users/[id]")).toBe("/users/:id");
    expect(canonicalizePath("/files/[...slug]")).toBe("/files/:slug");
    expect(canonicalizePath("/users/:id")).toBe("/users/:id");
  });

  it("extracts Express method-call routes + links named handlers", async () => {
    const eps = await endpoints("express.ts", "src/routes/express.ts");
    const get = find(eps, "GET", "/users/:id");
    expect(get).toBeTruthy();
    expect(get!.handler).toContain("src/routes/express.ts#getUser@");
    expect(find(eps, "POST", "/users")).toBeTruthy();
  });

  it("extracts FastAPI decorators and derives the Pydantic request model", async () => {
    const eps = await endpoints("fastapi.py", "app/main.py");
    const post = find(eps, "POST", "/items");
    expect(post).toBeTruthy();
    expect(post!.requestShape).toEqual({ model: "Item" });
    // primitive param → no fabricated shape
    const get = find(eps, "GET", "/items/:item_id");
    expect(get).toBeTruthy();
    expect(get!.requestShape).toBeNull();
  });

  it("extracts Next.js App Router handlers with the derived route path", async () => {
    const eps = await endpoints("nextroute.ts", "src/app/users/[id]/route.ts");
    expect(find(eps, "GET", "/users/:id")).toBeTruthy();
    expect(find(eps, "POST", "/users/:id")).toBeTruthy();
  });

  it("never fabricates response shapes", async () => {
    const eps = await endpoints("express.ts", "src/routes/express.ts");
    expect(eps.every((e) => e.responseShape === null)).toBe(true);
  });
});

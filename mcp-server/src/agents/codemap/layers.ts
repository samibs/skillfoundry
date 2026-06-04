/**
 * Code Map — architectural layer assignment (STORY-006).
 *
 * Deterministic, table-driven cascade over path + import signals. Covers 100% of
 * file nodes (defaults to `shared`), then propagates each file's layer to the
 * symbol/model nodes declared in it. Pure — no filesystem, no ordering deps.
 */

import { type CodeMap, type Layer, type RawImport } from "./graph.js";

const FRONTEND_IMPORTS = ["react", "react-dom", "vue", "svelte", "@angular/core", "next/link", "next/navigation"];
const BACKEND_IMPORTS = [
  "express", "fastify", "hono", "koa", "@nestjs/core", "@nestjs/common", "next/server",
  "pg", "@prisma/client", "prisma", "mongoose", "drizzle-orm", "typeorm", "sequelize",
  "fastapi", "flask", "django", "sqlalchemy",
];

const hasAny = (imports: string[], needles: string[]): boolean =>
  imports.some((i) => needles.some((n) => i === n || i.startsWith(n + "/")));

/** Decide a file's layer from its path and import specifiers. db → frontend → backend → shared. */
export function assignLayer(file: string, imports: string[]): Layer {
  // db: schema/migration locations
  if (file.endsWith(".prisma")) return "db";
  if (/(^|\/)(migrations|alembic)(\/|$)/.test(file)) return "db";
  if (/(^|\/)(models|entities|schema|schemas)(\/|\.)/.test(file)) return "db";

  // A Next App Router server route handler is backend even though it sits under app/.
  if (/(^|\/)route\.(t|j)sx?$/.test(file)) return "backend";

  // frontend: framework imports, JSX/Vue/Svelte files, or UI directories
  if (hasAny(imports, FRONTEND_IMPORTS)) return "frontend";
  if (/\.(tsx|jsx|vue|svelte)$/.test(file)) return "frontend";
  if (/(^|\/)(components|pages|views|ui|app)(\/)/.test(file) && /\.(ts|js|tsx|jsx)$/.test(file)) {
    return "frontend";
  }

  // backend: server framework imports, API/route/controller dirs, or Python server files
  if (hasAny(imports, BACKEND_IMPORTS)) return "backend";
  if (/(^|\/)(api|routes|controllers|server|backend|services|handlers)(\/)/.test(file)) return "backend";
  if (file.endsWith(".py")) return "backend";

  return "shared";
}

/** Mutates the map: tags every file node, then propagates to symbols in that file. */
export function assignLayers(map: CodeMap): void {
  const importsByFile = new Map<string, string[]>();
  for (const ri of map.rawImports) {
    const list = importsByFile.get(ri.fromFile) ?? [];
    list.push(ri.specifier);
    importsByFile.set(ri.fromFile, list);
  }

  const layerByFile = new Map<string, Layer>();
  for (const n of map.nodes) {
    if (n.kind !== "file") continue;
    const layer = assignLayer(n.file, importsByFile.get(n.file) ?? []);
    n.layer = layer;
    layerByFile.set(n.file, layer);
  }
  for (const n of map.nodes) {
    if (n.kind === "file") continue;
    n.layer = layerByFile.get(n.file) ?? "shared";
  }
}

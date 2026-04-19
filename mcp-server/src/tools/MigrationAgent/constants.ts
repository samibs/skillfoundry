/**
 * MigrationAgent constants — tool metadata and input schema for sf_migrate.
 */

export const TOOL_NAME = "sf_migrate";

export const TOOL_DESCRIPTION =
  "Run database migration (Prisma/Drizzle/Knex). Actions: deploy, status, seed, reset.";

export const TOOL_TIER = "TIER2" as const;

export const INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    projectPath: { type: "string", description: "Project root path" },
    action: {
      type: "string",
      enum: ["deploy", "status", "seed", "reset"],
      description: "Migration action",
    },
  },
  required: ["projectPath"],
};

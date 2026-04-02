/**
 * NginxAgent constants — tool metadata and input schema for sf_nginx_config.
 */

export const TOOL_NAME = "sf_nginx_config";

export const TOOL_DESCRIPTION =
  "Generate and validate an nginx reverse proxy config for an app.";

export const TOOL_TIER = "TIER3" as const;

export const INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    domain: { type: "string", description: "Domain name" },
    port: { type: "number", description: "Upstream app port" },
    ssl: { type: "boolean", description: "Enable SSL (default: true)" },
  },
  required: ["domain", "port"],
};

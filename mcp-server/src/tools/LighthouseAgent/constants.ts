/**
 * LighthouseAgent constants — tool metadata and input schema for sf_lighthouse.
 */

export const TOOL_NAME = "sf_lighthouse";

export const TOOL_DESCRIPTION =
  "Run Lighthouse performance audit on a URL. Returns scores for performance, accessibility, SEO.";

export const TOOL_TIER = "TIER3" as const;

export const INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    url: { type: "string", description: "URL to audit" },
  },
  required: ["url"],
};

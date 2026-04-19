/**
 * SemgrepAgent constants — tool metadata and input schema for sf_security_scan.
 */

export const TOOL_NAME = "sf_security_scan";

export const TOOL_DESCRIPTION =
  "Run Semgrep SAST security scan with OWASP rules. Returns findings by severity.";

export const TOOL_TIER = "TIER1" as const;

export const INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    projectPath: { type: "string", description: "Project root path" },
    rulesets: {
      type: "array",
      items: { type: "string" },
      description: "Semgrep rulesets (default: auto)",
    },
  },
  required: ["projectPath"],
};

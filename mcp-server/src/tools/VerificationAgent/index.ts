/**
 * VerificationAgent tool module — self-contained MCP tool for sf_verify.
 */

import { TOOL_NAME, TOOL_DESCRIPTION, TOOL_TIER, INPUT_SCHEMA } from "./constants.js";
import { CATEGORY } from "./permissions.js";
import { verify } from "./VerificationAgent.js";
import type { VerificationStrategy } from "./VerificationAgent.js";
import type { ToolModule, ToolResult } from "../types.js";

const verificationAgentModule: ToolModule = {
  name: TOOL_NAME,
  description: TOOL_DESCRIPTION,
  tier: TOOL_TIER,
  category: CATEGORY,
  inputSchema: INPUT_SCHEMA,

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const projectPath = args.projectPath as string;
    if (!projectPath) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "projectPath is required" }) }],
        isError: true,
      };
    }

    const strategies = args.strategies as VerificationStrategy[] | undefined;
    if (!strategies || !Array.isArray(strategies) || strategies.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: "strategies array is required and must not be empty" }),
          },
        ],
        isError: true,
      };
    }

    const validStrategies: VerificationStrategy[] = ["build", "test", "typecheck", "lint"];
    const invalid = strategies.filter((s) => !validStrategies.includes(s));
    if (invalid.length > 0) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: `Invalid strategies: ${invalid.join(", ")}. Valid: ${validStrategies.join(", ")}`,
            }),
          },
        ],
        isError: true,
      };
    }

    const claims = (args.claims as Record<string, string>) || undefined;

    try {
      const report = await verify(projectPath, strategies, claims);
      return {
        content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
        isError: !report.verified,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  },
};

export default verificationAgentModule;

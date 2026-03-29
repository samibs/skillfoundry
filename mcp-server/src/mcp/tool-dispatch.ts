/**
 * Tool Dispatch — routes MCP tool calls to the appropriate agent.
 */

import { runBuild } from "../agents/build-agent.js";
import { runTests } from "../agents/test-runner-agent.js";
import { checkDependencies } from "../agents/dependency-agent.js";
import { assignPort, checkPort } from "../agents/port-agent.js";
import { getStatus, commit } from "../agents/git-agent.js";
import { runTypeCheck } from "../agents/typecheck-agent.js";
import { runLint } from "../agents/lint-agent.js";
import { runMigration } from "../agents/migration-agent.js";
import { checkAndGenerateEnv } from "../agents/env-agent.js";
import { runLighthouse } from "../agents/lighthouse-agent.js";
import { dockerBuild, composeUp } from "../agents/docker-agent.js";
import { setupNginxForApp } from "../agents/nginx-agent.js";
import { checkContracts } from "../agents/contract-check-agent.js";
import { generateProjectContext } from "../agents/project-context-agent.js";
import { runSecurityScanLite } from "../agents/security-scan-lite-agent.js";
import { checkVersions } from "../agents/version-check-agent.js";
import { handleSessionRecording } from "../agents/session-recorder-agent.js";

type McpContent = { type: "text"; text: string };
type McpResult = { content: McpContent[]; isError?: boolean };

function jsonResult(data: unknown, isError = false): McpResult {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    isError,
  };
}

/**
 * Dispatch a tool call to the appropriate agent.
 * Returns null if the tool name is not handled by this dispatcher.
 */
export async function dispatchToolAgent(
  name: string,
  args: Record<string, unknown>
): Promise<McpResult | null> {
  switch (name) {
    // ─── Tier 1 ───────────────────────────────────────────
    case "sf_build": {
      const result = await runBuild(args.projectPath as string);
      return jsonResult(result, !result.passed);
    }

    case "sf_run_tests": {
      const result = await runTests(
        args.projectPath as string,
        args.pattern as string | undefined
      );
      return jsonResult(result, !result.passed);
    }

    case "sf_check_deps": {
      const result = await checkDependencies(args.projectPath as string);
      return jsonResult(result, !result.passed);
    }

    case "sf_assign_port": {
      const result = await assignPort(args.appName as string);
      return jsonResult(result, !result.assigned);
    }

    case "sf_check_port": {
      const result = await checkPort(args.port as number);
      return jsonResult(result);
    }

    // ─── Tier 2 ───────────────────────────────────────────
    case "sf_git_status": {
      const result = await getStatus(args.projectPath as string);
      return jsonResult(result);
    }

    case "sf_git_commit": {
      const result = await commit(
        args.projectPath as string,
        args.message as string,
        args.files as string[] | undefined
      );
      return jsonResult(result, !result.success);
    }

    case "sf_typecheck": {
      const result = await runTypeCheck(args.projectPath as string);
      return jsonResult(result, !result.passed);
    }

    case "sf_lint": {
      const result = await runLint(
        args.projectPath as string,
        args.autoFix as boolean | undefined
      );
      return jsonResult(result, !result.passed);
    }

    case "sf_migrate": {
      const result = await runMigration(
        args.projectPath as string,
        (args.action as "deploy" | "status" | "seed" | "reset") || "deploy"
      );
      return jsonResult(result, !result.passed);
    }

    case "sf_check_env": {
      const result = await checkAndGenerateEnv(
        args.projectPath as string,
        args.autoGenerate as boolean | undefined
      );
      return jsonResult(result, !result.passed);
    }

    // ─── Tier 3 ───────────────────────────────────────────
    case "sf_lighthouse": {
      const result = await runLighthouse(args.url as string);
      return jsonResult(result, !result.passed);
    }

    case "sf_docker_build": {
      const result = await dockerBuild(
        args.projectPath as string,
        args.tag as string | undefined
      );
      return jsonResult(result, !result.passed);
    }

    case "sf_docker_compose": {
      const result = await composeUp(
        args.projectPath as string,
        args.detach as boolean | undefined
      );
      return jsonResult(result, !result.passed);
    }

    case "sf_nginx_config": {
      const result = await setupNginxForApp({
        domain: args.domain as string,
        port: args.port as number,
        ssl: (args.ssl as boolean) ?? true,
      });
      return jsonResult(result);
    }

    // ─── Tier 4 ───────────────────────────────────────────
    case "sf_contract_check": {
      const result = await checkContracts(args.projectPath as string);
      return jsonResult(result, !result.passed);
    }

    case "sf_project_context": {
      const result = await generateProjectContext(args.projectPath as string);
      return jsonResult(result);
    }

    case "sf_security_scan_lite": {
      const result = await runSecurityScanLite(args.projectPath as string);
      return jsonResult(result, !result.passed);
    }

    case "sf_version_check": {
      const result = await checkVersions(args.projectPath as string);
      return jsonResult(result, !result.passed);
    }

    case "sf_session_record": {
      const result = await handleSessionRecording({
        action: args.action as "record" | "query" | "promote",
        projectPath: args.projectPath as string,
        entryType: args.entryType as "decision" | "correction" | "error" | "fact" | "pattern" | undefined,
        content: args.content as string | undefined,
        context: args.context as string | undefined,
        scope: args.scope as "project" | "universal" | undefined,
        tags: args.tags as string[] | undefined,
        limit: args.limit as number | undefined,
      });
      return jsonResult(result, !result.success);
    }

    default:
      return null; // Not handled by this dispatcher
  }
}

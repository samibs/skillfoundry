/**
 * GitAgent constants — tool metadata and input schemas for sf_git_status and sf_git_commit.
 */

export const GIT_STATUS_TOOL_NAME = "sf_git_status";
export const GIT_STATUS_DESCRIPTION =
  "Get git status: branch, staged/modified/untracked files, ahead/behind.";

export const GIT_COMMIT_TOOL_NAME = "sf_git_commit";
export const GIT_COMMIT_DESCRIPTION = "Stage files and create a git commit.";

export const TOOL_TIER = "TIER2" as const;

export const GIT_STATUS_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    projectPath: { type: "string", description: "Project root path" },
  },
  required: ["projectPath"],
};

export const GIT_COMMIT_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    projectPath: { type: "string", description: "Project root path" },
    message: { type: "string", description: "Commit message" },
    files: {
      type: "array",
      items: { type: "string" },
      description: "Files to stage (optional, stages all if omitted)",
    },
  },
  required: ["projectPath", "message"],
};

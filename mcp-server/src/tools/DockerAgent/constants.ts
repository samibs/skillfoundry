/**
 * DockerAgent constants — tool metadata and input schemas for sf_docker_build and sf_docker_compose.
 */

export const DOCKER_BUILD_NAME = "sf_docker_build";
export const DOCKER_BUILD_DESCRIPTION =
  "Build a Docker image from a project's Dockerfile.";

export const DOCKER_COMPOSE_NAME = "sf_docker_compose";
export const DOCKER_COMPOSE_DESCRIPTION =
  "Run docker compose up --build for a project.";

export const TOOL_TIER = "TIER3" as const;

export const DOCKER_BUILD_SCHEMA = {
  type: "object" as const,
  properties: {
    projectPath: { type: "string", description: "Project root path" },
    tag: { type: "string", description: "Image tag (default: sf-<project>:latest)" },
  },
  required: ["projectPath"],
};

export const DOCKER_COMPOSE_SCHEMA = {
  type: "object" as const,
  properties: {
    projectPath: { type: "string", description: "Project root path" },
    detach: { type: "boolean", description: "Run in background" },
  },
  required: ["projectPath"],
};

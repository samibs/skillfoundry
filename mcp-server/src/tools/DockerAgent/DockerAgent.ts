/**
 * DockerAgent execution logic — Docker build and compose operations.
 */

import { exec, commandExists } from "../../agents/exec-utils.js";
import { access } from "fs/promises";
import path from "path";

export interface DockerResult {
  passed: boolean;
  available: boolean;
  action: string;
  containerId: string | null;
  image: string | null;
  output: string;
  duration: number;
  error: string | null;
}

/**
 * Check if Docker is available and running.
 */
export async function isDockerAvailable(): Promise<boolean> {
  if (!(await commandExists("docker"))) return false;
  const result = await exec("docker", ["info"], { timeout: 10000 });
  return result.success;
}

/**
 * Build a Docker image from a project's Dockerfile.
 */
export async function dockerBuild(
  projectPath: string,
  tag?: string
): Promise<DockerResult> {
  const imageTag = tag || `sf-${path.basename(projectPath)}:latest`;

  // Check Dockerfile exists
  try {
    await access(path.join(projectPath, "Dockerfile"));
  } catch {
    return {
      passed: false,
      available: await isDockerAvailable(),
      action: "build",
      containerId: null,
      image: null,
      output: "",
      duration: 0,
      error: "No Dockerfile found in project root",
    };
  }

  const result = await exec(
    "docker",
    ["build", "-t", imageTag, "."],
    { cwd: projectPath, timeout: 600000 } // 10 min for builds
  );

  return {
    passed: result.success,
    available: true,
    action: "build",
    containerId: null,
    image: result.success ? imageTag : null,
    output: result.stdout.slice(-2000),
    duration: result.duration,
    error: result.success ? null : result.stderr.slice(0, 500),
  };
}

/**
 * Run docker compose up.
 */
export async function composeUp(
  projectPath: string,
  detach?: boolean
): Promise<DockerResult> {
  const args = ["compose", "up"];
  if (detach) args.push("-d");
  args.push("--build");

  const result = await exec("docker", args, {
    cwd: projectPath,
    timeout: 600000,
  });

  return {
    passed: result.success,
    available: true,
    action: "compose-up",
    containerId: null,
    image: null,
    output: result.stdout.slice(-2000),
    duration: result.duration,
    error: result.success ? null : result.stderr.slice(0, 500),
  };
}

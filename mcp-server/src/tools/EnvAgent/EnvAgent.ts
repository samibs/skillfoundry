/**
 * EnvAgent execution logic — checks .env against .env.example and optionally generates secrets.
 */

import { readFile, writeFile, access } from "fs/promises";
import path from "path";
import crypto from "crypto";

export interface EnvCheckResult {
  passed: boolean;
  envExists: boolean;
  exampleExists: boolean;
  missing: string[];
  empty: string[];
  generated: GeneratedSecret[];
  duration: number;
}

export interface GeneratedSecret {
  variable: string;
  method: string;
  value?: string;
}

/**
 * Parse a .env file into a Map of key-value pairs.
 * Skips blank lines and comments (lines starting with #).
 */
function parseEnvFile(content: string): Map<string, string> {
  const vars = new Map<string, string>();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      vars.set(trimmed.slice(0, eqIdx), trimmed.slice(eqIdx + 1));
    }
  }
  return vars;
}

/**
 * Generate a cryptographically secure value for a given variable name.
 * Returns null for variables that require human-provided values.
 */
function generateSecretForVar(varName: string): GeneratedSecret | null {
  const upper = varName.toUpperCase();

  if (upper.includes("SECRET") || upper.includes("SESSION")) {
    const value = crypto.randomBytes(48).toString("base64");
    return { variable: varName, method: "crypto.randomBytes(48).base64", value };
  }

  if (upper.includes("API_KEY") || upper.includes("APIKEY")) {
    const value = `sk_${crypto.randomBytes(24).toString("hex")}`;
    return { variable: varName, method: "sk_ + crypto.randomBytes(24).hex", value };
  }

  if (upper.includes("WEBHOOK")) {
    const value = `whsec_${crypto.randomBytes(24).toString("hex")}`;
    return { variable: varName, method: "whsec_ + crypto.randomBytes(24).hex", value };
  }

  if (
    upper.includes("PASSWORD") ||
    upper.includes("URL") ||
    upper.includes("HOST") ||
    upper.includes("PORT") ||
    upper.includes("EMAIL") ||
    upper.includes("USER")
  ) {
    return null;
  }

  return null;
}

/**
 * Compare .env against .env.example, find missing/empty vars, auto-generate secrets.
 */
export async function checkEnv(
  projectPath: string,
  autoGenerate?: boolean
): Promise<EnvCheckResult> {
  const start = Date.now();
  const envPath = path.join(projectPath, ".env");
  const examplePath = path.join(projectPath, ".env.example");

  let envExists = false;
  let exampleExists = false;
  let envContent = "";
  let exampleContent = "";

  try {
    await access(envPath);
    envExists = true;
    envContent = await readFile(envPath, "utf-8");
  } catch {
    // .env does not exist
  }

  try {
    await access(examplePath);
    exampleExists = true;
    exampleContent = await readFile(examplePath, "utf-8");
  } catch {
    // .env.example does not exist
  }

  if (!exampleExists) {
    return {
      passed: false,
      envExists,
      exampleExists: false,
      missing: [".env.example not found"],
      empty: [],
      generated: [],
      duration: Date.now() - start,
    };
  }

  const exampleVars = parseEnvFile(exampleContent);
  const envVars = envExists ? parseEnvFile(envContent) : new Map<string, string>();

  const missing: string[] = [];
  const empty: string[] = [];
  const generated: GeneratedSecret[] = [];

  for (const [key] of exampleVars) {
    if (!envVars.has(key)) {
      missing.push(key);
    } else if (!envVars.get(key)?.trim()) {
      empty.push(key);
    }
  }

  if (autoGenerate && (missing.length > 0 || empty.length > 0)) {
    const toGenerate = [...missing, ...empty];
    const newEnvLines = envExists
      ? envContent.split("\n")
      : exampleContent.split("\n");

    for (const varName of toGenerate) {
      const secret = generateSecretForVar(varName);
      if (secret) {
        generated.push(secret);

        const lineIdx = newEnvLines.findIndex(
          (l) => l.startsWith(`${varName}=`) || l.startsWith(`# ${varName}=`)
        );
        if (lineIdx >= 0) {
          newEnvLines[lineIdx] = `${varName}=${secret.value}`;
        } else {
          newEnvLines.push(`${varName}=${secret.value}`);
        }
      }
    }

    if (generated.length > 0) {
      await writeFile(envPath, newEnvLines.join("\n"));
    }
  }

  return {
    passed: missing.length === 0 && empty.length === 0,
    envExists,
    exampleExists: true,
    missing,
    empty,
    generated,
    duration: Date.now() - start,
  };
}

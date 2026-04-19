/**
 * Session persistence — save, load, and list sessions from disk.
 * All sessions are stored as JSON files in a configurable directory.
 */

import { mkdirSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Serialized representation of a session stored on disk.
 */
export interface StoredSession {
  /** Unique session identifier. */
  sessionId: string;
  /** Total input tokens consumed across all turns. */
  inputTokens: number;
  /** Total output tokens consumed across all turns. */
  outputTokens: number;
  /** Number of turns recorded. */
  turnCount: number;
  /** ISO timestamp of when the session was created. */
  createdAt: string;
  /** ISO timestamp of the last activity. */
  lastActive: string;
  /** Serialized transcript data. */
  transcript: object;
}

/**
 * Persists a session to disk as a JSON file.
 *
 * Creates the directory recursively if it does not exist.
 *
 * @param session - The session data to persist.
 * @param directory - The directory to write the session file into.
 * @returns The absolute path of the written file.
 */
export function saveSession(session: StoredSession, directory: string): string {
  mkdirSync(directory, { recursive: true });
  const filePath = join(directory, `${session.sessionId}.json`);
  writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8');
  return filePath;
}

/**
 * Loads a session from disk by its ID.
 *
 * @param sessionId - The session ID to look up.
 * @param directory - The directory containing session files.
 * @returns The parsed StoredSession, or null if the file does not exist or is unreadable.
 */
export function loadSession(sessionId: string, directory: string): StoredSession | null {
  const filePath = join(directory, `${sessionId}.json`);
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

/**
 * Lists all session IDs found in the given directory.
 *
 * Reads all `.json` files and extracts session IDs from filenames.
 *
 * @param directory - The directory to scan.
 * @returns An array of session ID strings.
 */
export function listSessions(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }
  try {
    const entries = readdirSync(directory);
    return entries
      .filter((entry) => entry.endsWith('.json'))
      .map((entry) => entry.replace(/\.json$/, ''));
  } catch {
    return [];
  }
}

/**
 * STORY-002 (CLI): sf audit — View audit log
 *
 * Usage:
 *   sf audit                 Show audit log summary
 *   sf audit --recent N      Show last N entries
 *   sf audit --gate T1       Filter by gate tier
 *   sf audit --verdict fail  Filter by verdict
 *   sf audit --json          JSON output
 */
import type { SlashCommand } from '../types.js';
export declare const auditCommand: SlashCommand;

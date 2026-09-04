/**
 * /mission — Governed Development Mission Protocol.
 *
 * Implements the operator surface for `agents/_governed-mission-protocol.md`. Every
 * subcommand writes a machine-readable artifact under `.ai/` that outlives the agent
 * that produced it, so a replacement worker with no chat history can reconstruct
 * project state from git + ledger + attestations + patches + evidence.
 *
 * Usage:
 *   /mission init <ID> --title "..."        Register a mission and scaffold .ai/
 *   /mission attest <ID> [--worker w]       Attest the worker environment (before writes)
 *   /mission baseline [--fetch]             Classify baseline freshness vs the remote
 *   /mission evidence <ID> --kind tests --run "npm test"
 *   /mission ac <ID> --file criteria.json   Load the acceptance-criteria matrix
 *   /mission commit <ID> --sha <sha>        Record the worker commit + stable patch ID
 *   /mission provenance <ID> --worker <sha> --integration <ref>
 *   /mission publish-check <ID> --branch main --sha <sha>
 *   /mission set <ID> <dimension> <STATUS>  Evidence-gated lifecycle promotion
 *   /mission gap open|close|list
 *   /mission collide --a name:f1,f2 --b name:f3,f4
 *   /mission verify <ID>                    Definition-of-Done gate
 *   /mission report <ID>                    Structured final report
 *   /mission reconcile                      Ledger vs. repository truth
 */
import type { SlashCommand } from '../types.js';
export declare const missionCommand: SlashCommand;

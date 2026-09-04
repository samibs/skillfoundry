/**
 * /delivery — Delivery Efficiency.
 *
 * Operator surface for the risk-based execution layer: classify a task's delivery budget,
 * pick the narrowest sufficient test scope, reuse validation that is still provably valid,
 * and decide objectively when a task is finished.
 *
 * Usage:
 *   /delivery status                        Settings and mission summary
 *   /delivery budget "<task text>" [--files a,b] [--override HIGH]
 *   /delivery policy <LOW|MEDIUM|HIGH>      Execution policy for a budget
 *   /delivery scope --budget MEDIUM [--files a,b] [--dependents 20] [--gate]
 *   /delivery check --kind test --command "npm test" [--files a,b]
 *   /delivery evidence [list|clear]
 *   /delivery context                       Shared mission facts and handoffs
 *   /delivery gate                          Integration-gate plan from recorded handoffs
 *   /delivery complete --budget MEDIUM ...  Stop-condition verdict
 *   /delivery efficiency                    Per-task efficiency report
 */
import type { SlashCommand } from '../types.js';
export declare const deliveryCommand: SlashCommand;

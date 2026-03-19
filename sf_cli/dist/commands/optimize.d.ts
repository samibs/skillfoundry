/**
 * Optimize CLI command — mutation-based skill prompt optimization.
 *
 * Usage:
 *   /optimize <skill-name> [--iterations N] [--time-budget S] [--apply] [--strategies s1,s2]
 *   /optimize list                 — List available mutation strategies
 *   /optimize history              — Show recent optimization experiments
 *   /optimize result <id>          — Show a specific experiment result
 */
import type { SlashCommand } from '../types.js';
export declare const optimizeCommand: SlashCommand;

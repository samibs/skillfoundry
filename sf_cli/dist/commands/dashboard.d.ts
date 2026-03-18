/**
 * Dashboard CLI command — multi-project overview, drill-down, and analytics.
 *
 * Usage:
 *   sf dashboard                          — Project overview table
 *   sf dashboard sync [--json]            — Force-sync all projects into central DB
 *   sf dashboard status <project>         — Detailed single-project view
 *   sf dashboard failures [--severity X] [--project X]  — Cross-project failure report
 *   sf dashboard top [--by events|failures|cost|perf]   — Project rankings
 *   sf dashboard kpi [--project X]        — Computed KPI metrics
 *   sf dashboard health                   — Health assessment for all projects
 *   sf dashboard import [path]            — Import session files from inbox or path
 *   sf dashboard patterns [--project X]   — Failure pattern analysis
 *   sf dashboard serve [--port N]         — Start web dashboard server
 *   All subcommands support --json for machine-readable output.
 */
import type { SlashCommand } from '../types.js';
export declare const dashboardCommand: SlashCommand;

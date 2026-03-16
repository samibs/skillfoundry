/**
 * STORY-003: Policy-as-Code Enforcement
 *
 * Validates project configuration against team policy constraints.
 * Used in CI via `sf gates --policy-check` to enforce org-wide standards.
 *
 * Checks:
 * - Gate thresholds meet team minimums
 * - AI model is on the approved list
 * - Banned patterns are enforced (not disabled)
 * - Memory sync configured if team requires it
 */
export type PolicySeverity = 'error' | 'warning';
export interface PolicyViolation {
    rule: string;
    severity: PolicySeverity;
    message: string;
    field: string;
    expected: string;
    actual: string;
}
export interface PolicyCheckResult {
    passed: boolean;
    violations: PolicyViolation[];
    team_org: string;
    team_version: string;
    checked_at: string;
}
/**
 * Run all policy checks against the project configuration.
 * Returns a result with pass/fail and all violations.
 */
export declare function checkPolicy(workDir: string, currentVersion?: string): PolicyCheckResult;
/**
 * Format policy check result as human-readable text.
 */
export declare function formatPolicyResult(result: PolicyCheckResult): string;

import type { PipelineCallbacks, PipelineResult } from '../types.js';
export type IssueSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type IssueCategory = 'BLOCKER' | 'TEST_GAP' | 'BUILD_FAILURE' | 'SECURITY' | 'QUALITY' | 'ANOMALY' | 'CIRCUIT_BREAKER' | 'DEPENDENCY' | 'GATE_FAILURE';
export interface SessionIssue {
    id: string;
    severity: IssueSeverity;
    category: IssueCategory;
    title: string;
    detail: string;
    story?: string;
    phase: string;
    occurredAt: string;
    remediation: string;
    relatedIssues: string[];
}
export interface SessionAnomaly {
    id: string;
    type: string;
    description: string;
    evidence: string[];
    detectedAt: string;
}
export interface SessionReport {
    runId: string;
    startedAt: string;
    completedAt: string;
    issues: SessionIssue[];
    anomalies: SessionAnomaly[];
    errorPatterns: ErrorPattern[];
    summary: SessionSummary;
}
export interface ErrorPattern {
    signature: string;
    occurrences: number;
    stories: string[];
    firstSeen: string;
    likelyRootCause: string;
}
export interface SessionSummary {
    totalIssues: number;
    bySeverity: Record<IssueSeverity, number>;
    byCategory: Record<string, number>;
    blockers: number;
    anomalies: number;
    storiesWithIssues: number;
    topRemediations: string[];
}
export declare class SessionRecorder {
    private runId;
    private startedAt;
    private issues;
    private anomalies;
    private errorSignatures;
    private currentPhase;
    private currentStory;
    private storyResults;
    private gateResults;
    private storiesTotal;
    private storiesCompleted;
    private storiesFailed;
    private buildBaselineHealthy;
    private testsFoundCount;
    constructor(runId: string);
    addIssue(severity: IssueSeverity, category: IssueCategory, title: string, detail: string, remediation: string, opts?: {
        story?: string;
        relatedIssues?: string[];
    }): string;
    addAnomaly(type: string, description: string, evidence: string[]): string;
    trackErrorPattern(signature: string, story: string, likelyRootCause: string): void;
    createCallbacks(): PipelineCallbacks;
    private handleGateFailure;
    private handleMicroGateFailure;
    private classifyBuildError;
    detectAnomalies(result: PipelineResult): void;
    generateReport(): SessionReport;
    private buildSummary;
    writeReport(workDir: string): {
        jsonPath: string;
        mdPath: string;
    };
    private formatMarkdown;
    getIssues(): readonly SessionIssue[];
    getAnomalies(): readonly SessionAnomaly[];
    getIssueCount(): number;
    getBlockerCount(): number;
}

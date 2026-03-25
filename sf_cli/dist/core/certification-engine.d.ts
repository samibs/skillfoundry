/**
 * RegForge Certification Engine — Static analysis pipeline for project certification.
 *
 * 11 audit categories, weighted scoring, grade computation (A-F),
 * HTML report generation, and DB persistence. No LLM calls.
 */
import type Database from 'better-sqlite3';
export interface CertFinding {
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    category: string;
    title: string;
    description: string;
    file?: string;
    line?: number;
    recommendation: string;
}
export interface CategoryResult {
    category: string;
    score: number;
    pass: boolean;
    weight: number;
    findings: CertFinding[];
    durationMs: number;
}
export type CertGrade = 'A' | 'B' | 'C' | 'D' | 'F';
export interface CertificationResult {
    id: string;
    projectPath: string;
    projectName: string;
    grade: CertGrade;
    overallScore: number;
    categories: CategoryResult[];
    totalFindings: number;
    findingsBySeverity: Record<string, number>;
    startedAt: string;
    completedAt: string;
    durationMs: number;
}
export interface CertificationOptions {
    projectPath: string;
    categories?: string[];
}
export declare function auditSecurity(projectPath: string): CategoryResult;
export declare function auditDocumentation(projectPath: string): CategoryResult;
export declare function auditTesting(projectPath: string): CategoryResult;
export declare function auditDependencies(projectPath: string): CategoryResult;
export declare function auditLicense(projectPath: string): CategoryResult;
export declare function auditAccessibility(projectPath: string): CategoryResult;
export declare function auditPrivacy(projectPath: string): CategoryResult;
export declare function auditArchitecture(projectPath: string): CategoryResult;
export declare function auditSeo(projectPath: string): CategoryResult;
export declare function auditPerformance(projectPath: string): CategoryResult;
export declare function auditCiCd(projectPath: string): CategoryResult;
export declare function getAllCategories(): string[];
export declare function computeGrade(score: number): CertGrade;
export declare function computeOverallScore(categories: CategoryResult[]): number;
export declare function runCertification(options: CertificationOptions): CertificationResult;
export declare function insertCertificationRun(db: Database.Database, result: CertificationResult): void;
export declare function getCertificationRun(db: Database.Database, runId: string): CertificationResult | null;
export declare function getCertificationHistory(db: Database.Database, limit?: number): Array<{
    id: string;
    project_name: string;
    grade: string;
    overall_score: number;
    total_findings: number;
    completed_at: string;
}>;
export declare function formatCertificationReport(result: CertificationResult): string;
export declare function generateHtmlReport(result: CertificationResult): string;
export declare function generateMarkdownReport(result: CertificationResult): string;
export declare function generateWordReport(result: CertificationResult): string;
export declare function generateRemediationPrd(result: CertificationResult): string;

export interface BaselineSnapshot {
    timestamp: string;
    work_dir: string;
    test_file_count: number;
    lint_error_count: number;
    type_error_count: number;
    loc: number;
    file_count: number;
    primary_language: string;
    language_breakdown: Record<string, number>;
}
/**
 * Collect a baseline snapshot of code quality metrics for the given directory.
 *
 * @param workDir - The project root directory to analyze
 * @returns BaselineSnapshot with collected metrics
 */
export declare function collectBaseline(workDir: string): Promise<BaselineSnapshot>;
/**
 * Format a baseline snapshot for console display.
 *
 * @param snapshot - The baseline snapshot to format
 * @returns Formatted string for CLI output
 */
export declare function formatBaseline(snapshot: BaselineSnapshot): string;

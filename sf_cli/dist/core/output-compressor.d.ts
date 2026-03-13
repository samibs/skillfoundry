export interface CompressionResult {
    compressed: string;
    originalBytes: number;
    compressedBytes: number;
    type: string;
}
export type CommandType = 'git-status' | 'git-log' | 'git-diff' | 'git-oneshot' | 'test-runner' | 'build-lint' | 'pkg-install' | 'docker' | 'log-dedup' | 'default';
/**
 * Detect command type from command string.
 * For chained commands (&&, ||, ;), checks each segment.
 */
export declare function detectCommandType(command: string): CommandType;
export declare function compressGitStatus(output: string): string;
export declare function compressGitOneshot(command: string, output: string): string;
export declare function compressGitLog(output: string): string;
export declare function compressGitDiff(output: string, isError: boolean): string;
export declare function compressTestRunner(output: string, isError: boolean): string;
export declare function compressBuildLint(output: string): string;
export declare function compressPkgInstall(output: string): string;
export declare function compressDocker(output: string): string;
export declare function collapseRepeatedLines(output: string): string;
/**
 * Compress command output based on detected command type.
 * Pure function, no side effects, <1ms for typical outputs.
 */
export declare function compressOutput(command: string, rawOutput: string, isError: boolean): CompressionResult;

/**
 * Code Transform Booster — Fast mechanical code transforms without LLM calls.
 *
 * Handles: var→const, add types, wrap async, add export, require→import,
 * add JSDoc stubs, callback→async. Near-instant, zero token cost.
 */
export type TransformId = 'var-to-const' | 'add-types' | 'wrap-async' | 'add-export' | 'require-to-import' | 'add-jsdoc';
export interface TransformResult {
    id: TransformId;
    name: string;
    applied: boolean;
    changeCount: number;
    description: string;
}
export interface BoostResult {
    originalCode: string;
    transformedCode: string;
    transforms: TransformResult[];
    totalChanges: number;
    tokensSaved: number;
}
/**
 * Convert `var` to `const` or `let` based on reassignment.
 */
export declare function transformVarToConst(code: string): {
    code: string;
    result: TransformResult;
};
/**
 * Add `: unknown` type annotation to untyped function parameters.
 */
export declare function transformAddTypes(code: string): {
    code: string;
    result: TransformResult;
};
/**
 * Wrap bare `await` calls that aren't in a try block.
 */
export declare function transformWrapAsync(code: string): {
    code: string;
    result: TransformResult;
};
/**
 * Add `export` to top-level function/class declarations.
 */
export declare function transformAddExport(code: string): {
    code: string;
    result: TransformResult;
};
/**
 * Convert `require()` to `import` syntax.
 */
export declare function transformRequireToImport(code: string): {
    code: string;
    result: TransformResult;
};
/**
 * Add JSDoc stubs to undocumented functions.
 */
export declare function transformAddJsdoc(code: string): {
    code: string;
    result: TransformResult;
};
export declare function getTransformList(): Array<{
    id: TransformId;
    name: string;
    description: string;
}>;
/**
 * Detect which transforms are applicable to the given code.
 */
export declare function detectApplicableTransforms(code: string): TransformId[];
/**
 * Apply transforms to a code string.
 */
export declare function boostCode(code: string, options?: {
    transforms?: TransformId[];
    dryRun?: boolean;
}): BoostResult;
/**
 * Apply transforms to a file.
 */
export declare function boostFile(filePath: string, options?: {
    transforms?: TransformId[];
    dryRun?: boolean;
}): BoostResult;
export declare function formatBoostReport(result: BoostResult): string;
export declare function formatTransformList(): string;

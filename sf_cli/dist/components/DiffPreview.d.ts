export interface DiffLine {
    type: 'add' | 'remove' | 'context' | 'header';
    content: string;
    lineNumber?: number;
}
interface DiffPreviewProps {
    fileName: string;
    lines: DiffLine[];
    maxLines?: number;
}
export declare function parseDiff(rawDiff: string): Array<{
    fileName: string;
    lines: DiffLine[];
}>;
export declare function DiffPreview({ fileName, lines, maxLines }: DiffPreviewProps): import("react/jsx-runtime").JSX.Element;
export {};

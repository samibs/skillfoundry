export type ApprovalResponse = 'approve' | 'reject' | 'edit';
interface ApprovalPromptProps {
    title: string;
    description?: string;
    fileCount?: number;
    onRespond: (response: ApprovalResponse) => void;
}
export declare function ApprovalPrompt({ title, description, fileCount, onRespond }: ApprovalPromptProps): import("react/jsx-runtime").JSX.Element;
export {};

import type { ProviderAdapter, StreamCallback, ContentBlock, AnthropicMessage } from '../../types.js';
export declare class GeminiAdapter implements ProviderAdapter {
    name: string;
    private apiKey;
    constructor();
    stream(messages: Array<{
        role: string;
        content: string;
    }>, options: {
        model: string;
        maxTokens?: number;
        systemPrompt?: string;
    }, onChunk: StreamCallback): Promise<{
        inputTokens: number;
        outputTokens: number;
        costUsd: number;
        thinkingContent?: string;
    }>;
    streamWithTools(messages: AnthropicMessage[], options: {
        model: string;
        maxTokens?: number;
        systemPrompt?: string;
        tools: Array<{
            name: string;
            description: string;
            input_schema: unknown;
        }>;
    }, onChunk: StreamCallback): Promise<{
        content: ContentBlock[];
        inputTokens: number;
        outputTokens: number;
        costUsd: number;
        stopReason: string;
        thinkingContent?: string;
    }>;
}
export declare function createGeminiProvider(): ProviderAdapter;

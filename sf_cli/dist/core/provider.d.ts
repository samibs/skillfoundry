import type { ProviderAdapter, StreamCallback, ContentBlock, AnthropicMessage } from '../types.js';
export declare class AnthropicAdapter implements ProviderAdapter {
    name: string;
    private client;
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
export declare const AVAILABLE_PROVIDERS: Record<string, {
    name: string;
    envKey: string;
    altEnvKeys?: string[];
    defaultModel: string;
}>;
export declare function createProvider(name: string): ProviderAdapter;
export declare function detectAvailableProviders(): string[];

import type { ProviderAdapter, StreamCallback, ContentBlock, AnthropicMessage } from '../../types.js';
export interface OpenAIAdapterOptions {
    name: string;
    apiKey?: string;
    baseURL?: string;
    defaultModel: string;
}
export declare class OpenAIAdapter implements ProviderAdapter {
    name: string;
    private client;
    private defaultModel;
    constructor(options: OpenAIAdapterOptions);
    private getEnvKey;
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
export declare function createOpenAIProvider(): ProviderAdapter;
export declare function createXAIProvider(): ProviderAdapter;
export declare function createOllamaProvider(): ProviderAdapter;
export declare function createLMStudioProvider(): ProviderAdapter;

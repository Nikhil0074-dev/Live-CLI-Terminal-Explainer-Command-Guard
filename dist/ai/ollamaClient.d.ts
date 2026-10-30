export type FetchLike = (input: string, init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
}) => Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
}>;
export declare class OllamaError extends Error {
    constructor(message: string);
}
export interface OllamaOptions {
    baseUrl: string;
    model: string;
    timeoutMs: number;
    fetchImpl?: FetchLike;
}
/** Minimal Ollama HTTP client (local only by default). Every call has a timeout. */
export declare class OllamaClient {
    private readonly baseUrl;
    private readonly model;
    private readonly timeoutMs;
    private readonly fetchImpl;
    constructor(opts: OllamaOptions);
    private request;
    /** Names of locally installed models. */
    listModels(timeoutMs?: number): Promise<string[]>;
    isAvailable(): Promise<boolean>;
    hasModel(): Promise<boolean>;
    /** Non-streaming JSON generation. Returns the raw model text. */
    generate(prompt: string): Promise<string>;
}

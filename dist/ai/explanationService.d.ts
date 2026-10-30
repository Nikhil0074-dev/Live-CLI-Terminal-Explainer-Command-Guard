import type { GuardConfig } from "../config/configSchema";
import type { Analysis, Explanation, Finding } from "../types";
import { FetchLike } from "./ollamaClient";
export interface ExplainOptions {
    /** Ask the local model for an explanation (otherwise built-in explanations are used). */
    useAi: boolean;
    fetchImpl?: FetchLike;
    promptsDir?: string;
}
export interface ExplainOutcome {
    explanation: Explanation;
    aiAttempted: boolean;
    aiFailed: boolean;
}
export declare function clearExplanationCache(): void;
/**
 * Produces an explanation. This service has NO influence on allow/block
 * decisions: it only returns text for display. Any AI failure falls back to
 * the deterministic explainer and is reported in `aiNote`.
 */
export declare function explain(analysis: Analysis, findings: Finding[], config: GuardConfig, opts: ExplainOptions): Promise<ExplainOutcome>;

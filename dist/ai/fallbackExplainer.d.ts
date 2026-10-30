import type { Analysis, Explanation, Finding } from "../types";
/** Plain-language explanation that needs no AI. */
export declare function explainDeterministic(analysis: Analysis, findings?: Finding[], aiNote?: string): Explanation;
/** Compact, factual description of known commands, passed to the LLM as grounding. */
export declare function knownFacts(analysis: Analysis): string[];

import type { Analysis } from "../types";
/** Remove anything that could break out of the <command> delimiter. */
export declare function sanitizeForPrompt(cmd: string): string;
export declare function buildExplanationPrompt(analysis: Analysis, promptsDir?: string): string;

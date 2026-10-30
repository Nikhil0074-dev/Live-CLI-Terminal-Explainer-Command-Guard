import type { Explanation } from "../types";
/**
 * Model text is untrusted: strip terminal control characters (ANSI escape
 * injection), limit length, and drop anything that is not a plain string.
 */
export declare function cleanText(s: string): string;
/** Returns a validated, sanitised Explanation, or null when the model output is unusable. */
export declare function parseExplanation(text: string): Explanation | null;

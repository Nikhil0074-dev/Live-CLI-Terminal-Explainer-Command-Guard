import type { Analysis, Segment } from "../types";
/** Analyse a command typed as a single shell string. Never executes anything. */
export declare function analyzeCommand(raw: string): Analysis;
/**
 * Analyse a command that is already split into arguments (e.g. `guard run -- rm -rf x`).
 * Shell metacharacters inside arguments are literal data in this mode.
 */
export declare function analyzeArgv(argv: string[]): Analysis;
/** All segments in this analysis and every nested analysis, with a label for where they came from. */
export declare function collectSegments(a: Analysis): Array<{
    segment: Segment;
    analysis: Analysis;
}>;
/** True when this analysis or any nested one is uncertain. */
export declare function isUncertain(a: Analysis): boolean;
export declare function allUncertaintyReasons(a: Analysis): string[];
export declare function allUnrecognized(a: Analysis): string[];

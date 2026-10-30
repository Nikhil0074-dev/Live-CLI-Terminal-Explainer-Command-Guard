import type { Decision, Explanation, PolicyResult, RiskLevel } from "../types";
export interface Style {
    color: boolean;
}
export declare function colorEnabled(stream?: {
    isTTY?: boolean;
}, env?: NodeJS.ProcessEnv): boolean;
declare const CODES: Record<string, string>;
export declare function paint(st: Style, name: keyof typeof CODES, text: string): string;
/** Strip anything that could control the terminal from untrusted text (commands, model output). */
export declare function safeText(s: string): string;
export declare function riskBadge(st: Style, risk: RiskLevel): string;
export declare function decisionText(st: Style, d: Decision): string;
export declare function renderExplanation(st: Style, e: Explanation): string;
export declare function renderAnalysis(st: Style, command: string, policy: PolicyResult, explanation?: Explanation): string;
/** Short form used by shell hooks. */
export declare function renderCompact(st: Style, command: string, policy: PolicyResult): string;
export {};

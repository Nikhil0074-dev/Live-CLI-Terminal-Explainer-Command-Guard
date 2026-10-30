/** Shared types for the whole project. */
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Decision = "ALLOW" | "WARN" | "CONFIRM" | "BLOCK";
export declare const RISK_ORDER: Record<RiskLevel, number>;
export declare const DECISION_ORDER: Record<Decision, number>;
export declare function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel;
export declare function maxDecision(a: Decision, b: Decision): Decision;
export type RuleCategory = "filesystem" | "permissions" | "git" | "database" | "cloud" | "network" | "process" | "shell" | "privilege" | "policy" | "general";
/** One shell "word" after quote removal. */
export interface Token {
    value: string;
    /** Any part of the word was quoted. */
    quoted: boolean;
    /** Contains $VAR, ${VAR}, $(...), `...`, $((..)) etc. The final value is unknown. */
    hasExpansion: boolean;
    /** Contains an unquoted glob or brace expansion. */
    hasGlob: boolean;
}
export interface Redirection {
    op: string;
    target: string;
    targetHasExpansion: boolean;
}
export interface RawSegment {
    tokens: Token[];
    redirections: Redirection[];
    operatorBefore: string | null;
    raw: string;
}
export interface TokenizeResult {
    segments: RawSegment[];
    operators: string[];
    substitutions: string[];
    errors: string[];
    hasHeredoc: boolean;
    hasVariables: boolean;
    hasSubstitution: boolean;
    hasGrouping: boolean;
}
/** A single simple command (one stage of a pipeline / list). */
export interface Segment {
    raw: string;
    /** Tokens after inline VAR=value assignments. Includes wrappers such as sudo. */
    argv: string[];
    argvTokens: Token[];
    env: Record<string, string>;
    /** Basename of the real executable (after wrappers such as sudo/env). */
    executable: string | null;
    /** Full text of the executable as typed. */
    executableText: string | null;
    executableHasExpansion: boolean;
    args: Token[];
    privileged: boolean;
    wrappers: string[];
    redirections: Redirection[];
    operatorBefore: string | null;
    /** Executable is in the built-in catalogue of well-understood commands. */
    known: boolean;
}
export interface Analysis {
    raw: string;
    mode: "string" | "argv";
    segments: Segment[];
    operators: string[];
    nested: Analysis[];
    /** Why this nested analysis exists, e.g. "bash -c", "$(...)", "find -exec". */
    nestedVia: string | null;
    hasPipe: boolean;
    hasSubstitution: boolean;
    hasVariables: boolean;
    hasGlob: boolean;
    pipeToShell: boolean;
    uncertain: boolean;
    uncertaintyReasons: string[];
    unrecognized: string[];
    /** True when the command cannot be run faithfully without a shell. */
    needsShell: boolean;
}
export interface Finding {
    ruleId: string;
    category: RuleCategory;
    risk: RiskLevel;
    reason: string;
    requiresConfirmation: boolean;
    /** Hard block: only policy-level (administrator) changes can lift it. */
    block?: boolean;
    /** Mandatory findings cannot be downgraded by trusted-command allow lists. */
    mandatory?: boolean;
    target?: string;
}
export interface PolicyResult {
    decision: Decision;
    risk: RiskLevel;
    score: number;
    findings: Finding[];
    reasons: string[];
    blockedBy: string[];
    requiresConfirmation: boolean;
    uncertain: boolean;
    /** Decision came from the unrecognised/uncertain-command policy rather than a finding. */
    fromUnknownPolicy: boolean;
}
export interface FlagExplanation {
    flag: string;
    meaning: string;
}
export interface Explanation {
    source: "ai" | "fallback";
    summary: string;
    flags: FlagExplanation[];
    sideEffects: string[];
    uncertainties: string[];
    /** Set when AI was requested but unavailable/invalid. */
    aiNote?: string;
}
export interface GuardResult {
    decision: Decision;
    risk: RiskLevel;
    approved: boolean;
    executed: boolean;
    exitCode: number;
    cancelled: boolean;
    blocked: boolean;
    findings: Finding[];
    message?: string;
}
export declare const EXIT: {
    readonly OK: 0;
    readonly GENERIC_ERROR: 1;
    readonly USAGE: 2;
    readonly CHECK_CONFIRM: 2;
    readonly CHECK_BLOCK: 3;
    readonly BLOCKED: 126;
    readonly NOT_FOUND: 127;
    readonly CANCELLED: 130;
};

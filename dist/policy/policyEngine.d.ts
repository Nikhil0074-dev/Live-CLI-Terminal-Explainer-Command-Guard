import type { GuardConfig } from "../config/configSchema";
import { Analysis, Finding, PolicyResult } from "../types";
export declare function normalizeCommand(s: string): string;
/** Convert a glob (only `*` is special) or `regex:` pattern into a RegExp. Throws on bad regex. */
export declare function patternToRegExp(pattern: string): RegExp;
/** Text forms of a command that patterns are matched against. */
export declare function commandForms(analysis: Analysis): string[];
export declare function matchesAny(patterns: string[], forms: string[]): string | null;
/**
 * Deterministic policy decision. The LLM is never consulted here.
 *
 * Precedence:
 *  1. mandatory blocks (blocked-command patterns, protected targets, hard-block findings)
 *  2. critical findings (block unless blockCriticalOperations=false, then confirm)
 *  3. mandatory confirmations (production targets)
 *  4. risk-based default (HIGH->confirm, MEDIUM->warn, LOW->allow)
 *  5. unknown/uncertain command policy (a floor, never lowers a decision)
 *  6. trusted-command allow list (may lower CONFIRM->WARN, never overrides 1-3)
 */
export declare function evaluatePolicy(analysis: Analysis, findingsIn: Finding[], config: GuardConfig): PolicyResult;

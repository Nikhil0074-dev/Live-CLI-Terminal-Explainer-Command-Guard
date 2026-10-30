import * as path from "node:path";
import type { Finding, RiskLevel, RuleCategory, Token } from "../types";
import { isCriticalPath, isSystemArea } from "../utils/paths";
import type { RuleContext } from "./ruleTypes";
export interface ParsedArgs {
    short: Set<string>;
    long: Set<string>;
    longValues: Map<string, string>;
    positionals: Token[];
    /** All flag-like words in order, as typed. */
    rawFlags: string[];
}
/** Generic POSIX/GNU style argument parser. Flags with values are not modelled; callers handle those. */
export declare function parseArgs(args: Token[]): ParsedArgs;
export declare function hasFlag(p: ParsedArgs, shortChars: string, longNames?: string[]): boolean;
export declare function finding(ruleId: string, category: RuleCategory, risk: RiskLevel, reason: string, extra?: Partial<Finding>): Finding;
export interface ResolvedTarget {
    token: Token;
    abs: string;
    /** The user typed a glob; abs is the directory the glob ranges over. */
    isGlob: boolean;
    /** The path contains a variable/substitution, so abs is a best guess. */
    unresolved: boolean;
}
/** Resolve positional path-like tokens to absolute paths (no filesystem access). */
export declare function resolveTargets(tokens: Token[], ctx: RuleContext): ResolvedTarget[];
export declare function matchesProtected(abs: string, ctx: RuleContext, includeAncestors: boolean): string | null;
export { isCriticalPath, isSystemArea, path };
export declare function containsHost(text: string, hosts: string[]): string | null;

import type { Analysis, Finding } from "../types";
import type { Rule } from "./ruleTypes";
/** Per-segment privilege and interpreter rules. */
export declare const shellRules: Rule;
/** Summary finding when the analyser could not fully understand the command. */
export declare function uncertaintyFindings(reasons: string[]): Finding[];
export declare function unrecognizedFindings(names: string[]): Finding[];
export type { Analysis };

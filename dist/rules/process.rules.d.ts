import type { Finding } from "../types";
import type { Rule } from "./ruleTypes";
/** Rules that look at the whole command text rather than one segment. */
export declare function analysisLevelProcessFindings(raw: string): Finding[];
export declare const processRules: Rule;

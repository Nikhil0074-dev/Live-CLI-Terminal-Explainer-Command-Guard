import type { GuardConfig } from "../config/configSchema";
import { EnvironmentContext } from "../environment/environmentDetector";
import { Analysis, Finding } from "../types";
import type { Rule } from "./ruleTypes";
export declare const ALL_RULES: Rule[];
export interface EvaluateOptions {
    config: GuardConfig;
    cwd?: string;
    home?: string;
    env?: NodeJS.ProcessEnv;
    environment?: EnvironmentContext;
}
/**
 * Deterministic rule evaluation. Pure with respect to the command: the same
 * analysis, config and environment always produce the same findings.
 * Nothing is executed and the filesystem is never touched.
 */
export declare function evaluateRules(analysis: Analysis, opts: EvaluateOptions): Finding[];

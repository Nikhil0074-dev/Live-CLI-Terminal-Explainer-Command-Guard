import type { GuardConfig } from "../config/configSchema";
import type { EnvironmentContext } from "../environment/environmentDetector";
import type { Analysis, Finding, Segment } from "../types";
export interface RuleContext {
    segment: Segment;
    analysis: Analysis;
    config: GuardConfig;
    cwd: string;
    home: string;
    /** Process environment merged with inline VAR=value of this segment. */
    env: Record<string, string | undefined>;
    environment: EnvironmentContext;
}
export type Rule = (ctx: RuleContext) => Finding[];

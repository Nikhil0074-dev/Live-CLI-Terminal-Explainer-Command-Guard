import type { FetchLike } from "../ai/ollamaClient";
import type { GuardConfig } from "../config/configSchema";
import { EnvironmentContext } from "../environment/environmentDetector";
import type { AuditLogger } from "../logging/auditLogger";
import { Style } from "../ui/terminalFormatter";
import { Analysis, Explanation, Finding, GuardResult, PolicyResult } from "../types";
import { LineReader } from "./confirmation";
export interface GuardDeps {
    config: GuardConfig;
    logger: AuditLogger;
    cwd: string;
    home: string;
    env: NodeJS.ProcessEnv;
    /** Where guard messages are written. */
    write: (s: string) => void;
    style: Style;
    reader: LineReader;
    fetchImpl?: FetchLike;
    promptsDir?: string;
    stdio?: "inherit" | "pipe";
    environment?: EnvironmentContext;
}
export interface GuardInput {
    /** A command typed as one shell string. */
    raw?: string;
    /** A command already split into arguments (executed without a shell). */
    argv?: string[];
}
export interface GuardOptions {
    useAi?: boolean;
    dryRun?: boolean;
    assumeYes?: boolean;
    source?: "run" | "hook" | "check";
}
export interface Assessment {
    analysis: Analysis;
    findings: Finding[];
    policy: PolicyResult;
    explanation: Explanation;
    aiAttempted: boolean;
    aiFailed: boolean;
}
export declare function analyzeInput(input: GuardInput): Analysis;
/** Analyse + apply rules + decide policy + explain. Executes nothing. */
export declare function assess(input: GuardInput, deps: GuardDeps, opts?: GuardOptions): Promise<Assessment>;
export declare function categoryOf(findings: Finding[]): string;
/**
 * The full guarded workflow:
 * analyse -> rules -> policy -> explain -> (block | confirm | warn) -> execute -> audit.
 * The explanation (AI or not) is display-only and cannot approve anything.
 */
export declare function guardedRun(input: GuardInput, deps: GuardDeps, opts?: GuardOptions): Promise<GuardResult>;

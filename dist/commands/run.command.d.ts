import { CliIO } from "./runtime";
export interface RunCliOptions {
    ai?: boolean;
    dryRun?: boolean;
    yes?: boolean;
}
/** Analyse, enforce policy, then run. Guard messages go to stderr so program output stays clean. */
export declare function runGuarded(parts: string[], opts: RunCliOptions, io: CliIO): Promise<number>;

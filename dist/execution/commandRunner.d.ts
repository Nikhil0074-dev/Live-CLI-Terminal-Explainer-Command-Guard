import type { Analysis } from "../types";
export interface RunOptions {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    /** "inherit" for interactive use, "pipe" to capture output (tests). */
    stdio?: "inherit" | "pipe";
    home?: string;
}
export interface RunOutcome {
    exitCode: number;
    signal: string | null;
    stdout: string;
    stderr: string;
    error?: string;
    usedShell: boolean;
}
/**
 * Execute an already-approved command.
 * - Simple commands run directly (no shell), so arguments and quoting are preserved exactly.
 * - Commands that need shell syntax (pipes, globs, variables, redirects) run through
 *   `sh -c <original text>`; the text is never rebuilt or concatenated.
 */
export declare function runCommand(analysis: Analysis, opts?: RunOptions): Promise<RunOutcome>;

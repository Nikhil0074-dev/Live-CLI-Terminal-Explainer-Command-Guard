import type { SupportedShell } from "../shell/shellDetector";
import { CliIO } from "./runtime";
/**
 * Called by the Bash/Zsh integration before a command line runs.
 * Exit codes: 0 = let the shell run it, 3 = deny (blocked or cancelled), anything else = the guard itself failed
 * (a crashed Node process exits 1, so "1" must never mean "denied").
 */
export declare function hookCheck(line: string, io: CliIO): Promise<number>;
export declare function installHookCommand(shell: SupportedShell, rcFile: string | undefined, io: CliIO): number;
export declare function uninstallHookCommand(shell: SupportedShell, rcFile: string | undefined, io: CliIO): number;

import { CliIO } from "./runtime";
export interface CheckOptions {
    json?: boolean;
    ai?: boolean;
    preview?: boolean;
}
/** Analyse a command without running it. Exit: 0 allow/warn, 2 confirm, 3 block. */
export declare function checkCommand(parts: string[], opts: CheckOptions, io: CliIO): Promise<number>;

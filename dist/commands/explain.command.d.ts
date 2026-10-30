import { CliIO } from "./runtime";
export interface ExplainOptions {
    ai?: boolean;
    json?: boolean;
}
/** Explain a command without running it. */
export declare function explainCommand(parts: string[], opts: ExplainOptions, io: CliIO): Promise<number>;

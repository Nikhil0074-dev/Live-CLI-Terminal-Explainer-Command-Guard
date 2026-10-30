import { CliIO } from "./runtime";
export declare function historyCommand(opts: {
    n: number;
    json?: boolean;
    prune?: boolean;
}, io: CliIO): number;

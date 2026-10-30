import type { Decision, RiskLevel } from "../types";
export interface AuditRecord {
    timestamp: string;
    commandCategory: string;
    risk: RiskLevel;
    ruleIds: string[];
    decision: Decision;
    confirmationRequested: boolean;
    approved: boolean;
    executed: boolean;
    exitCode?: number;
    uncertain?: boolean;
    source?: "run" | "hook" | "check";
    /** Present only when logging.storeRawCommands is true (and always sanitised). */
    command?: string;
}
export interface AuditOptions {
    enabled: boolean;
    storeRawCommands: boolean;
    retentionDays: number;
    now?: () => Date;
}
export declare class AuditLogger {
    private readonly file;
    private readonly opts;
    constructor(file: string, opts: AuditOptions);
    private now;
    get path(): string;
    /** Never throws: a logging failure must not change a security decision. */
    write(rec: Omit<AuditRecord, "timestamp" | "command">, rawCommand?: string): boolean;
    read(limit?: number): AuditRecord[];
    /** Remove records older than the retention period. Returns the number removed. */
    prune(): number;
}

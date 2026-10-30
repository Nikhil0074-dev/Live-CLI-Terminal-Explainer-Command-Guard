import type { Readable } from "node:stream";
import type { FetchLike } from "../ai/ollamaClient";
import type { GuardConfig } from "../config/configSchema";
import { LineReader } from "../execution/confirmation";
import type { GuardDeps, GuardInput } from "../execution/executionController";
import { AuditLogger } from "../logging/auditLogger";
export interface CliIO {
    env: NodeJS.ProcessEnv;
    cwd: string;
    stdin: Readable;
    stdout: (s: string) => void;
    stderr: (s: string) => void;
    stdoutIsTTY?: boolean;
    stderrIsTTY?: boolean;
    fetchImpl?: FetchLike;
    /** Capture child output instead of inheriting stdio (used by tests). */
    capture?: boolean;
    /** Test hook: provide a terminal for hook prompts. */
    openTty?: () => {
        reader: LineReader;
        write: (s: string) => void;
        close: () => void;
    } | null;
}
export declare function processIO(): CliIO;
export interface Runtime {
    config: GuardConfig;
    configPath: string;
    logger: AuditLogger;
    home: string;
    deps: (target: "stdout" | "stderr") => GuardDeps;
    close: () => void;
}
export declare function auditPath(config: GuardConfig, env: NodeJS.ProcessEnv): string;
export declare function buildRuntime(io: CliIO): Runtime;
/** One argument = a shell string; several arguments = an already-split argv (no shell parsing). */
export declare function toInput(parts: string[]): GuardInput;

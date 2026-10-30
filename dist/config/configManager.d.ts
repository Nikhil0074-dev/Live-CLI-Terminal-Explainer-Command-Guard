import { ZodError } from "zod";
import { GuardConfig } from "./configSchema";
export declare class ConfigError extends Error {
    constructor(message: string);
}
export interface LoadOptions {
    env?: NodeJS.ProcessEnv;
    /** Directory holding policy profiles. Defaults to <package>/policies. */
    profilesDir?: string;
    /** Explicit config path (overrides GUARD_CONFIG / default). */
    configPath?: string;
}
export declare function packageRoot(): string;
export declare function defaultConfigPath(env?: NodeJS.ProcessEnv): string;
type Json = Record<string, unknown>;
/**
 * Merge b over a. Objects merge recursively; arrays are UNIONED (so a policy
 * profile's blocked commands cannot be removed by a user config); scalars from b win.
 */
export declare function mergeConfig(a: Json, b: Json): Json;
export declare function formatZodError(err: ZodError): string;
/** Validate a plain object against the schema and return the typed config. */
export declare function parseConfig(obj: unknown): GuardConfig;
/**
 * Load configuration. Precedence (lowest to highest):
 * built-in defaults < policy profile < user config file.
 * A missing user file is fine; a present-but-invalid file is an error (fail closed).
 */
export declare function loadConfig(opts?: LoadOptions): {
    config: GuardConfig;
    path: string;
    exists: boolean;
};
/** A copy of the config that is safe to print (no credentials are stored, but be defensive). */
export declare function redactConfig(cfg: GuardConfig): GuardConfig;
export declare function writeDefaultConfig(file: string, force?: boolean): boolean;
export {};

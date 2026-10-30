/**
 * Catalogue of commands the guard "understands". A command outside this set is
 * reported as unrecognised and handled by the configured unknown-command policy.
 */
export declare const SHELL_INTERPRETERS: Set<string>;
export declare const OTHER_INTERPRETERS: Set<string>;
/** Read-only or low-impact commands. */
export declare const READ_ONLY_COMMANDS: Set<string>;
/** Everyday developer tools. Recognised, but not assumed read-only: specific rules still apply (e.g. git). */
export declare const DEV_TOOLS: Set<string>;
/** Commands that modify things, but that the rule engine understands. */
export declare const MODIFYING_COMMANDS: Set<string>;
export declare function isKnownCommand(name: string | null): boolean;
/** sudo options that consume the following word. */
export declare const SUDO_ARG_OPTIONS: Set<string>;
export declare const SYSTEM_DIRS: string[];
/** Directories whose own deletion/ownership change is considered catastrophic. */
export declare const CRITICAL_DIRS: Set<string>;

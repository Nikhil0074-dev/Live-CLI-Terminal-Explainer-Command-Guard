export declare function guardHome(env?: NodeJS.ProcessEnv): string;
export declare function expandHome(p: string, home: string): string;
/** Resolve a user-typed path to an absolute, normalised POSIX path (no filesystem access). */
export declare function resolveTarget(p: string, cwd: string, home: string): string;
/**
 * For a possibly-globbed argument, return the directory that the glob ranges over.
 * "build/*" -> "build", "*.log" -> ".", "/*" -> "/", "~/*" -> "~".
 */
export declare function globBase(value: string): string;
export declare function isWithin(parent: string, child: string): boolean;
export declare function isCriticalPath(abs: string, home: string): boolean;
export declare function isSystemArea(abs: string): boolean;

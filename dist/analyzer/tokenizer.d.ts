import type { TokenizeResult } from "../types";
/** Find the index of the ")" matching the "(" at openIdx, or -1. */
export declare function findMatchingParen(s: string, openIdx: number): number;
export declare function tokenize(input: string): TokenizeResult;
/** Quote a single argument so it can be displayed/re-parsed safely by a POSIX shell. */
export declare function shellQuote(arg: string): string;
export declare function joinArgv(argv: string[]): string;

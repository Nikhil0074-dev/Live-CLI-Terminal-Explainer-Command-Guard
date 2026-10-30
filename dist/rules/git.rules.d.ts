import type { Token } from "../types";
import type { Rule } from "./ruleTypes";
export declare function gitSubcommand(args: Token[]): {
    sub: string | null;
    rest: Token[];
};
export declare const gitRules: Rule;

export type SupportedShell = "bash" | "zsh";
export declare function detectShell(env?: NodeJS.ProcessEnv): SupportedShell | null;

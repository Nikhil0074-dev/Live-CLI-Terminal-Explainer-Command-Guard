import * as path from "node:path";

export type SupportedShell = "bash" | "zsh";

export function detectShell(env: NodeJS.ProcessEnv = process.env): SupportedShell | null {
  const name = path.basename(env.SHELL ?? "");
  return name === "bash" || name === "zsh" ? name : null;
}

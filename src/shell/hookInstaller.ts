import * as fs from "node:fs";
import * as path from "node:path";
import { packageRoot } from "../config/configManager";
import type { SupportedShell } from "./shellDetector";

export const BEGIN_MARK = "# >>> live-cli-guard >>>";
export const END_MARK = "# <<< live-cli-guard <<<";

export function defaultRcFile(shell: SupportedShell, home: string): string {
  return path.join(home, shell === "bash" ? ".bashrc" : ".zshrc");
}

export function integrationScript(shell: SupportedShell): string {
  return path.join(packageRoot(), "integrations", shell, shell === "bash" ? "guard.bash" : "guard.zsh");
}

function shq(s: string): string {
  return "'" + s.replace(/'/g, `'\\''`) + "'";
}

export function hookBlock(shell: SupportedShell, nodePath: string, cliPath: string): string {
  return [
    BEGIN_MARK,
    `export GUARD_NODE=${shq(nodePath)}`,
    `export GUARD_CLI=${shq(cliPath)}`,
    `[ -f ${shq(integrationScript(shell))} ] && source ${shq(integrationScript(shell))}`,
    END_MARK,
    "",
  ].join("\n");
}

export function hasHook(rcText: string): boolean {
  return rcText.includes(BEGIN_MARK) && rcText.includes(END_MARK);
}

export function removeHookBlock(rcText: string): string {
  const start = rcText.indexOf(BEGIN_MARK);
  const end = rcText.indexOf(END_MARK);
  if (start < 0 || end < start) return rcText;
  const after = rcText.slice(end + END_MARK.length).replace(/^\r?\n/, "");
  return rcText.slice(0, start) + after;
}

export interface InstallResult {
  changed: boolean;
  rcFile: string;
  backup?: string;
}

export function installHook(shell: SupportedShell, rcFile: string, nodePath: string, cliPath: string): InstallResult {
  let text = "";
  try {
    text = fs.readFileSync(rcFile, "utf8");
  } catch {
    /* new file */
  }
  if (hasHook(text)) return { changed: false, rcFile };
  let backup: string | undefined;
  if (text) {
    backup = rcFile + ".guard-backup";
    if (!fs.existsSync(backup)) fs.writeFileSync(backup, text);
  }
  const sep = text && !text.endsWith("\n") ? "\n" : "";
  fs.writeFileSync(rcFile, text + sep + hookBlock(shell, nodePath, cliPath));
  return { changed: true, rcFile, backup };
}

export function uninstallHook(rcFile: string): InstallResult {
  let text: string;
  try {
    text = fs.readFileSync(rcFile, "utf8");
  } catch {
    return { changed: false, rcFile };
  }
  if (!hasHook(text)) return { changed: false, rcFile };
  fs.writeFileSync(rcFile, removeHookBlock(text));
  return { changed: true, rcFile };
}

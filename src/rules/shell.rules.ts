import { SHELL_INTERPRETERS } from "../analyzer/commandCatalog";
import type { Analysis, Finding } from "../types";
import { finding } from "./ruleHelpers";
import type { Rule } from "./ruleTypes";

/** Per-segment privilege and interpreter rules. */
export const shellRules: Rule = (ctx) => {
  const s = ctx.segment;
  const out: Finding[] = [];
  const cmd = s.executable;

  if (s.privileged) {
    const interactiveRoot =
      cmd !== null && (SHELL_INTERPRETERS.has(cmd) || cmd === "su") && !s.args.some((t) => /^-[A-Za-z]*c[A-Za-z]*$/.test(t.value));
    const sudoNoCmd = cmd === null;
    if (interactiveRoot || sudoNoCmd) {
      out.push(finding("PRIV_ROOT_SHELL", "privilege", "HIGH", "This opens an interactive shell with administrator rights; every later command runs as root."));
    } else {
      out.push(finding("PRIV_ELEVATED", "privilege", "MEDIUM", `Runs \`${cmd}\` with administrator privileges (${s.wrappers.filter((w) => w === "sudo" || w === "doas").join(", ")}).`));
    }
  }
  if (cmd === "su") {
    out.push(finding("PRIV_SWITCH_USER", "privilege", "MEDIUM", "su switches to another user account."));
  }
  if (cmd === "eval") {
    out.push(finding("SHELL_EVAL", "shell", "MEDIUM", "eval builds a command from text at run time, so its real effect cannot be known in advance."));
  }
  return out;
};

/** Summary finding when the analyser could not fully understand the command. */
export function uncertaintyFindings(reasons: string[]): Finding[] {
  if (reasons.length === 0) return [];
  return [
    finding(
      "SHELL_UNCERTAIN",
      "shell",
      "MEDIUM",
      `The guard cannot fully verify this command: ${reasons.join("; ")}.`,
    ),
  ];
}

export function unrecognizedFindings(names: string[]): Finding[] {
  if (names.length === 0) return [];
  return [finding("CMD_UNRECOGNIZED", "general", "LOW", `No built-in knowledge about: ${names.join(", ")}. It was not analysed for risk.`, { requiresConfirmation: false })];
}

export type { Analysis };

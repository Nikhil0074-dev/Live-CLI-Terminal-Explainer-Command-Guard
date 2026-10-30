#!/usr/bin/env node
import { Command, CommanderError } from "commander";
import { ConfigError } from "./config/configManager";
import { checkCommand } from "./commands/check.command";
import { configInit, configPath, configShow } from "./commands/config.command";
import { doctorCommand } from "./commands/doctor.command";
import { explainCommand } from "./commands/explain.command";
import { historyCommand } from "./commands/history.command";
import { hookCheck, installHookCommand, uninstallHookCommand } from "./commands/hook.command";
import { CliIO, processIO } from "./commands/runtime";
import { runGuarded } from "./commands/run.command";
import type { SupportedShell } from "./shell/shellDetector";

function asShell(s: string): SupportedShell {
  if (s === "bash" || s === "zsh") return s;
  throw new CommanderError(2, "guard.badShell", `Unsupported shell "${s}". Use bash or zsh.`);
}

/** Run the CLI. Returns the process exit code (never calls process.exit itself). */
export async function main(argv: string[], io: CliIO = processIO()): Promise<number> {
  let code = 0;
  const program = new Command();
  program
    .name("guard")
    .description("Live CLI Terminal Explainer & Command Guard: understand commands and stop dangerous ones.")
    .version("1.0.0")
    .enablePositionalOptions()
    .exitOverride()
    .configureOutput({ writeOut: (s) => io.stdout(s), writeErr: (s) => io.stderr(s) });

  const cmdArgs = (c: Command): Command => c.allowUnknownOption().passThroughOptions();

  cmdArgs(program.command("explain").description("Explain a command without running it").option("--no-ai", "do not use the local AI model").option("--json", "machine-readable output").argument("<command...>"))
    .action(async (parts: string[], o: { ai?: boolean; json?: boolean }) => void (code = await explainCommand(parts, o, io)));

  cmdArgs(program.command("check").description("Analyse risk without running (exit 0 allow/warn, 2 confirm, 3 block)").option("--json", "machine-readable output").option("--ai", "also request an AI explanation").option("--preview", "show what would be affected, when possible").argument("<command...>"))
    .action(async (parts: string[], o: { json?: boolean; ai?: boolean; preview?: boolean }) => void (code = await checkCommand(parts, o, io)));

  cmdArgs(program.command("run").description("Analyse, enforce policy, then run a command").option("--ai", "request an AI explanation").option("--dry-run", "do everything except execute").option("--yes", "assume approval for CONFIRM (only if security.allowYesFlag is true)").argument("<command...>"))
    .action(async (parts: string[], o: { ai?: boolean; dryRun?: boolean; yes?: boolean }) => void (code = await runGuarded(parts, o, io)));

  const cfg = program.command("config").description("Show or create the configuration");
  cfg.command("show").description("Print the active configuration").action(() => void (code = configShow(io)));
  cfg.command("path").description("Print the configuration file path").action(() => void (code = configPath(io)));
  cfg.command("init").description("Create a starter configuration file").option("--force", "overwrite an existing file").action((o: { force?: boolean }) => void (code = configInit(io, Boolean(o.force))));

  program.command("history").description("Show recent audit records").option("-n <count>", "number of records", "20").option("--json", "machine-readable output").option("--prune", "delete records older than the retention period")
    .action((o: { n: string; json?: boolean; prune?: boolean }) => void (code = historyCommand({ n: Number(o.n) || 20, json: o.json, prune: o.prune }, io)));

  program.command("doctor").description("Check the installation").action(async () => void (code = await doctorCommand(io)));

  program.command("hook-check", { hidden: true }).description("Used by shell integrations").argument("<line...>")
    .action(async (parts: string[]) => void (code = await hookCheck(parts.join(" "), io)));

  program.command("install-hook").description("Install the Bash or Zsh integration").argument("<shell>").option("--rc-file <file>", "shell startup file to edit")
    .action((s: string, o: { rcFile?: string }) => void (code = installHookCommand(asShell(s), o.rcFile, io)));
  program.command("uninstall-hook").description("Remove the Bash or Zsh integration").argument("<shell>").option("--rc-file <file>", "shell startup file to edit")
    .action((s: string, o: { rcFile?: string }) => void (code = uninstallHookCommand(asShell(s), o.rcFile, io)));

  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (e) {
    if (e instanceof CommanderError) return e.exitCode === 0 ? 0 : 2;
    if (e instanceof ConfigError) {
      io.stderr(`guard: ${e.message}\nThe guard refuses to run with an invalid configuration. Fix it or run: guard config path\n`);
      return 2;
    }
    io.stderr(`guard: unexpected error: ${(e as Error).message}\n`);
    return 1;
  }
  return code;
}

if (require.main === module) {
  main(process.argv.slice(2)).then((c) => {
    process.exitCode = c;
  });
}

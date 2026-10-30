#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const commander_1 = require("commander");
const configManager_1 = require("./config/configManager");
const check_command_1 = require("./commands/check.command");
const config_command_1 = require("./commands/config.command");
const doctor_command_1 = require("./commands/doctor.command");
const explain_command_1 = require("./commands/explain.command");
const history_command_1 = require("./commands/history.command");
const hook_command_1 = require("./commands/hook.command");
const runtime_1 = require("./commands/runtime");
const run_command_1 = require("./commands/run.command");
function asShell(s) {
    if (s === "bash" || s === "zsh")
        return s;
    throw new commander_1.CommanderError(2, "guard.badShell", `Unsupported shell "${s}". Use bash or zsh.`);
}
/** Run the CLI. Returns the process exit code (never calls process.exit itself). */
async function main(argv, io = (0, runtime_1.processIO)()) {
    let code = 0;
    const program = new commander_1.Command();
    program
        .name("guard")
        .description("Live CLI Terminal Explainer & Command Guard: understand commands and stop dangerous ones.")
        .version("1.0.0")
        .enablePositionalOptions()
        .exitOverride()
        .configureOutput({ writeOut: (s) => io.stdout(s), writeErr: (s) => io.stderr(s) });
    const cmdArgs = (c) => c.allowUnknownOption().passThroughOptions();
    cmdArgs(program.command("explain").description("Explain a command without running it").option("--no-ai", "do not use the local AI model").option("--json", "machine-readable output").argument("<command...>"))
        .action(async (parts, o) => void (code = await (0, explain_command_1.explainCommand)(parts, o, io)));
    cmdArgs(program.command("check").description("Analyse risk without running (exit 0 allow/warn, 2 confirm, 3 block)").option("--json", "machine-readable output").option("--ai", "also request an AI explanation").option("--preview", "show what would be affected, when possible").argument("<command...>"))
        .action(async (parts, o) => void (code = await (0, check_command_1.checkCommand)(parts, o, io)));
    cmdArgs(program.command("run").description("Analyse, enforce policy, then run a command").option("--ai", "request an AI explanation").option("--dry-run", "do everything except execute").option("--yes", "assume approval for CONFIRM (only if security.allowYesFlag is true)").argument("<command...>"))
        .action(async (parts, o) => void (code = await (0, run_command_1.runGuarded)(parts, o, io)));
    const cfg = program.command("config").description("Show or create the configuration");
    cfg.command("show").description("Print the active configuration").action(() => void (code = (0, config_command_1.configShow)(io)));
    cfg.command("path").description("Print the configuration file path").action(() => void (code = (0, config_command_1.configPath)(io)));
    cfg.command("init").description("Create a starter configuration file").option("--force", "overwrite an existing file").action((o) => void (code = (0, config_command_1.configInit)(io, Boolean(o.force))));
    program.command("history").description("Show recent audit records").option("-n <count>", "number of records", "20").option("--json", "machine-readable output").option("--prune", "delete records older than the retention period")
        .action((o) => void (code = (0, history_command_1.historyCommand)({ n: Number(o.n) || 20, json: o.json, prune: o.prune }, io)));
    program.command("doctor").description("Check the installation").action(async () => void (code = await (0, doctor_command_1.doctorCommand)(io)));
    program.command("hook-check", { hidden: true }).description("Used by shell integrations").argument("<line...>")
        .action(async (parts) => void (code = await (0, hook_command_1.hookCheck)(parts.join(" "), io)));
    program.command("install-hook").description("Install the Bash or Zsh integration").argument("<shell>").option("--rc-file <file>", "shell startup file to edit")
        .action((s, o) => void (code = (0, hook_command_1.installHookCommand)(asShell(s), o.rcFile, io)));
    program.command("uninstall-hook").description("Remove the Bash or Zsh integration").argument("<shell>").option("--rc-file <file>", "shell startup file to edit")
        .action((s, o) => void (code = (0, hook_command_1.uninstallHookCommand)(asShell(s), o.rcFile, io)));
    try {
        await program.parseAsync(argv, { from: "user" });
    }
    catch (e) {
        if (e instanceof commander_1.CommanderError)
            return e.exitCode === 0 ? 0 : 2;
        if (e instanceof configManager_1.ConfigError) {
            io.stderr(`guard: ${e.message}\nThe guard refuses to run with an invalid configuration. Fix it or run: guard config path\n`);
            return 2;
        }
        io.stderr(`guard: unexpected error: ${e.message}\n`);
        return 1;
    }
    return code;
}
if (require.main === module) {
    main(process.argv.slice(2)).then((c) => {
        process.exitCode = c;
    });
}

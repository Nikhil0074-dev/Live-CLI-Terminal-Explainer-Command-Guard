# Live CLI Terminal Explainer & Command Guard

Understand shell commands before they run, inspect their risk, and add a deterministic guard against common destructive operations.

Live CLI Terminal Guard is a TypeScript/Node.js command-line tool for Bash and Zsh. It analyzes commands, explains their likely effects, applies deterministic security rules, optionally asks a local Ollama model for a more natural-language explanation, and records decisions in a local audit log. **The model never decides whether a command is allowed.**

> A policy decision of `ALLOW` means no configured rule recognized a risk; it is not a guarantee that a command is safe. Read [Security notes](docs/security.md) before relying on the tool.


## Features

- Explain commands with built-in descriptions, with optional Ollama-generated explanations.
- Analyze shell syntax, pipelines, command substitutions, common wrappers, and selected nested commands.
- Evaluate filesystem, permissions, Git, database, cloud, network, process, and shell risks.
- Apply configurable policies for unknown commands, blocked patterns, trusted commands, protected paths, and production targets.
- Run commands under policy, request explicit confirmation, show previews where supported, or perform a dry run.
- Integrate with interactive Bash and Zsh prompts to check typed commands.
- Maintain a local audit trail without storing raw command text by default.

## Requirements

- Node.js 18 or later.
- npm for installation and scripts.
- Bash or Zsh for interactive shell hooks.
- Git Bash on Windows to run the Bash-based shell integration test scripts. Zsh and pseudo-terminal tests require a compatible Unix-like environment and the corresponding tools.
- Ollama is optional; built-in explanations and policy checks work without it.

## Install and build

From the project directory:

```bash
npm install
npm run build
node dist/cli.js doctor
```

To invoke the built CLI directly, use `node dist/cli.js`. To make the `guard` executable available through npm's global link mechanism:
 
```bash
npm link
guard doctor
```

To remove the global link later, run `npm unlink -g live-cli-terminal-guard` from the project directory.

On Windows, the project can be built and its Node/Vitest tests run from a regular terminal. The shell-hook tests use Bash; `npm run test:shell` locates Git Bash and adds the current Node executable to its `PATH`. Install Git for Windows if Git Bash is missing. Zsh and PTY checks are skipped when the required shell/test tools are unavailable.

## Quick start

```bash
# Explain without executing
node dist/cli.js explain "tar -xzf backup.tar.gz -C /tmp"

# Analyze risk without executing
node dist/cli.js check "sudo chmod -R 777 /var/www"

# Analyze and run; a confirmation may be required
node dist/cli.js run -- rm -rf build

# Show a preview where the command is supported
node dist/cli.js check --preview "rm -rf build"

# Check the installation and active configuration
node dist/cli.js doctor
```

For interactive shell protection, install a hook as described in [Shell hooks](#shell-hooks).

## Commands

| Command | Purpose |
|---|---|
| `guard explain <command...>` | Explain a command without running it. Uses the built-in explainer unless AI is explicitly enabled. Supports `--json` and `--no-ai`. |
| `guard check <command...>` | Analyze without execution. Supports `--json`, `--preview`, and `--ai`. |
| `guard run <command...>` | Analyze, enforce policy, request confirmation if required, then run the command. Supports `--dry-run`, `--yes`, and `--ai`. |
| `guard history` | Show recent audit records. Supports `-n <count>`, `--json`, and `--prune`. |
| `guard config show` | Print the active configuration after loading defaults and any policy profile. |
| `guard config path` | Print the configuration file path. |
| `guard config init` | Create a starter configuration. `--force` overwrites an existing file. |
| `guard doctor` | Check Node.js, config, rule-engine self-tests, audit-log access, optional shell hooks, and optional Ollama availability. |
| `guard install-hook bash\|zsh` | Add the relevant integration to the shell startup file. Accepts `--rc-file <file>`. |
| `guard uninstall-hook bash\|zsh` | Remove the marked integration block. Accepts `--rc-file <file>`. |

Examples below use `guard` after `npm link`. Without a global link, replace `guard` with `node dist/cli.js`.

### Explain

```bash
guard explain "find . -name '*.tmp' -delete"
guard explain --json "git reset --hard"
guard explain --no-ai "docker system prune"
```

`explain` never runs the command and does not apply a confirmation decision. It describes recognizable parts and likely effects; uncertain or unsupported syntax may not be fully explained.

### Check

```bash
guard check "git push --force origin main"
guard check --preview "rm -rf build"
guard check --json "terraform destroy"
guard check --ai "kubectl delete pod example"
```

`check` is read-only with respect to the command being inspected. A preview is only produced for supported, reliably understood operations; it is not a guarantee that the eventual effects will match the preview.

### Run

```bash
# A single argument is treated as shell command text
guard run "echo one && echo two"

# Multiple arguments after -- are treated as argv and are not shell-parsed
guard run -- rm -rf "build output"

# Show policy/confirmation behavior without executing
guard run --dry-run -- rm -rf build

# --yes only works if security.allowYesFlag is enabled
guard run --yes -- rm -rf build
```

`--yes` does not override a block. It is disabled by default, and the default confirmation response is no. Commands that require confirmation are cancelled if no usable interactive terminal/input is available.

### History

```bash
guard history
guard history -n 50 --json
guard history --prune
```

The history records decisions and rule identifiers. Raw command text is omitted unless `logging.storeRawCommands` is enabled; when enabled it is passed through a pattern-based sanitizer.

## How command input is interpreted

Input form matters:

- **One command argument** is interpreted as a shell command string. For example, `guard check "echo one && echo two"` analyzes both segments and the operator.
- **Several command arguments** are treated as an already split argument vector. For example, `guard run -- echo "hello there"` runs `echo` with a single argument containing a space. Shell metacharacters in argv mode are literal data, not additional commands.
- Use `--` to separate guard options from the command and its arguments. This is particularly important when the command itself uses flags that may look like guard options.

The runner executes a simple parsed command directly without a shell when possible. Shell syntax that needs interpretation is passed to the selected shell as the original text, not reconstructed from parsed tokens. The analyzer is conservative: constructs it cannot model are marked uncertain and are handled according to the unknown-command policy.

## Decisions and exit codes

Default decision mapping:

| Finding level | Default decision | Behavior |
|---|---|---|
| `LOW` | `ALLOW` | Run without a warning panel in normal `run` mode. |
| `MEDIUM` | `WARN` | Display findings, then proceed. |
| `HIGH` | `CONFIRM` | Show findings and a prompt; Enter or any non-yes response cancels. |
| `CRITICAL` | `BLOCK` | Refuse execution when critical-operation blocking is enabled. Hard blocks remain blocked. |

Policies and explicit hard-block findings may override the table. In particular, invalid configuration, blocked-command patterns, and protected-directory rules fail closed.

| Command/context | Exit code | Meaning |
|---|---:|---|
| `guard check` | `0` | Allow or warn; no confirmation is required. |
| `guard check` | `2` | Confirmation would be required by `run`. |
| `guard check` | `3` | Blocked by policy. |
| `guard run` | Child exit code | Command was approved and executed. |
| `guard run` | `126` | Blocked by policy. |
| `guard run` | `127` | Executable was not found. |
| `guard run` | `130` | Confirmation was declined or unavailable. |
| `guard hook-check` | `0` | Let the shell execute the line. |
| `guard hook-check` | `3` | Deny the line. |
| `guard hook-check` | Other non-zero | The guard itself failed; the hook's default behavior is to skip the command. |

A usage error or invalid configuration commonly exits with code `2` at the CLI level.

## Shell hooks

Install a hook for the shell you use:

```bash
guard install-hook bash
# or
guard install-hook zsh
```

The installer adds a marked block to `~/.bashrc` or `~/.zshrc` and creates a `.guard-backup` copy when applicable. Start a new shell or source the startup file, then verify with `guard doctor`. Remove only the installed block with:

```bash
guard uninstall-hook bash
# or
guard uninstall-hook zsh
```

You can target a specific startup file with `--rc-file <file>`.

The Bash integration uses `extdebug` and a `DEBUG` trap. It checks the whole interactive line when history allows, and checks simple commands individually in other cases. An existing `DEBUG` trap prevents installation. The Zsh integration wraps the `accept-line` widget used by Enter. See [Bash setup](docs/bash-setup.md) and [Zsh setup](docs/zsh-setup.md) for behavior and constraints.

Hook environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `GUARD_HOOK_MODE` | `risky` | `risky` calls the guard for lines matching the hook's risk filter; `all` checks every line. |
| `GUARD_HOOK_FAIL` | `closed` | `closed` skips commands if the guard fails; `open` prints a warning and allows the command. |
| `GUARD_DISABLE` | unset | Set to a non-empty value to bypass the hook for that shell. This is an explicit bypass, not an enforcement mechanism. |
| `GUARD_CLI` | unset | Path to the built `dist/cli.js` used by the installed hook. |
| `GUARD_NODE` | unset | Node executable used by the installed hook. |

## Configuration

Show or create the active configuration:

```bash
guard config path
guard config show
guard config init
```

By default, the configuration is stored under `~/.config/live-cli-guard/config.json` (or the platform-equivalent home/config location). `GUARD_HOME` can set the guard data directory; `XDG_CONFIG_HOME` can set the XDG config base. `GUARD_CONFIG` selects a configuration file explicitly. Invalid or unknown configuration fields cause the guard to refuse to run.

Example configuration:

```json
{
  "version": 1,
  "policyProfile": "production",
  "ai": {
    "enabled": true,
    "provider": "ollama",
    "baseUrl": "http://127.0.0.1:11434",
    "model": "YOUR_INSTALLED_MODEL",
    "timeoutMs": 8000
  },
  "security": {
    "defaultUnknownCommandPolicy": "CONFIRM",
    "requireConfirmationForHighRisk": true,
    "blockCriticalOperations": true,
    "allowExecutionWhenAiUnavailable": true,
    "allowYesFlag": false,
    "blockedCommands": ["terraform destroy*", "regex:^npm (publish|unpublish)"],
    "trustedCommands": ["rm -rf dist"],
    "hookMode": "risky"
  },
  "logging": {
    "enabled": true,
    "storeRawCommands": false,
    "retentionDays": 90
  },
  "environment": {
    "protectedDirectories": ["~/important-data"],
    "productionDatabaseHosts": ["prod-db.example.com"],
    "productionDatabaseNames": ["customer_data"],
    "productionCloudAccountIds": ["123456789012"],
    "productionCloudProfiles": ["prod"],
    "productionKubeContexts": ["prod-cluster"],
    "productionTerraformWorkspaces": ["production"]
  }
}
```

### Security settings

- `defaultUnknownCommandPolicy`: minimum decision applied to unrecognized or unverifiable commands. Valid values: `ALLOW`, `WARN`, `CONFIRM`, `BLOCK`.
- `requireConfirmationForHighRisk`: when `true`, high-risk operations require confirmation; when `false`, they warn instead.
- `blockCriticalOperations`: controls blocking for soft critical findings. Hard blocks such as protected paths remain blocked.
- `allowExecutionWhenAiUnavailable`: when `false`, a `run --ai` request refuses execution if the requested explanation service is unavailable. It does not affect the policy decision.
- `allowYesFlag`: enables `run --yes` for confirmation-level commands. It never overrides a block.
- `blockedCommands`: whole-command glob patterns, where `*` is the wildcard, or regex patterns prefixed with `regex:`. Invalid regexes fail configuration validation.
- `trustedCommands`: exact command matches after whitespace normalization. A trusted command may reduce `CONFIRM` to `WARN`, but never bypasses a block or mandatory production confirmation.
- `hookMode`: `risky` or `all`; the shell integration also accepts `GUARD_HOOK_MODE` as an environment override.

Security profiles are in `policies/`: `default`, `development`, and `production`. Select one with `policyProfile`. Profile arrays and user-config arrays are unioned, so a user configuration cannot remove profile block/trust entries by setting an empty list. For profile behavior and rule details, see [Command policies](docs/command-policies.md).

### Protected paths and production targets

`environment.protectedDirectories` contains paths that the guard must not modify through recognized operations. The engine checks typed paths without resolving symlinks or consulting the filesystem. Commands with unsupported destination syntax, scripts, or other unmodeled behavior may evade this detection; review the [security limitations](docs/security.md).

Production settings identify sensitive targets for supported command families:

- Database hosts and names: `productionDatabaseHosts`, `productionDatabaseNames`.
- Cloud accounts and profiles: `productionCloudAccountIds`, `productionCloudProfiles`.
- Kubernetes contexts: `productionKubeContexts`.
- Terraform workspaces: `productionTerraformWorkspaces`.

Recognized writes or destructive operations against configured production targets are blocked; other recognized connections or changes can require confirmation. Detection depends on supported syntax and configured target values.

## Optional Ollama explanations

Ollama is optional and affects explanations only. The default endpoint is `http://127.0.0.1:11434`; set `ai.model` to a model already installed in your local Ollama instance.

1. Install and start Ollama using its official instructions.
2. Pull a model suitable for your machine and inspect its installed name with `ollama list`.
3. Run `guard config init` and set `ai.model` in the resulting file.
4. Run `guard doctor` to check whether Ollama is reachable and the model is installed.
5. Use `guard explain "..."` or pass `--ai` to `check` or `run`.

Relevant settings are `ai.enabled`, `ai.provider` (currently `ollama`), `ai.baseUrl`, `ai.model`, and `ai.timeoutMs`. If Ollama is unavailable or its response cannot be used, the built-in explainer is used. **Policy decisions are unchanged.** See [Ollama setup](docs/ollama-setup.md).

## Audit log and privacy

The audit log is local. Records include the timestamp, category, risk, finding IDs, decision, confirmation/approval/execution status, and (for executed commands) the exit code. Raw commands are excluded by default.

- `logging.enabled` enables or disables audit writes.
- `logging.storeRawCommands` opts into storing sanitized command text. Sanitization is pattern-based and cannot identify every secret; leave this disabled if raw command data is sensitive.
- `logging.retentionDays` sets retention used by pruning.
- `logging.path` optionally selects a log file path.
- `guard history --prune` removes expired records; `guard run` also prunes during normal execution.

The command text may be sent to the configured Ollama endpoint when you use AI explanation. Ollama is local by default, but a custom `ai.baseUrl` may point elsewhere. See [Security notes](docs/security.md) for more privacy and threat-model details.

## How it works

```text
command input
    -> tokenizer and analyzer
    -> deterministic rule engine
    -> deterministic policy engine
    -> built-in or optional Ollama explanation (display only)
    -> preview / confirmation when applicable
    -> command runner
    -> sanitized local audit record
```

The analyzer tokenizes common shell syntax and recursively inspects selected constructs such as nested `bash -c`, command substitution, `eval`, `find -exec`, and `xargs`. The rule engine generates findings; the policy engine makes the decision without consulting AI output. The runner uses direct process execution for simple commands and invokes a shell only when shell syntax is needed.

See [Architecture](docs/architecture.md) for more detail.

## Limitations and security model

This utility is a safety aid, **not a sandbox, complete security boundary, or substitute for operating-system access controls**.

- Interactive hooks cover only the configured shell integration. Scripts, cron, CI, IDE task runners, other shells, and programs that spawn subprocesses are outside its protection.
- Users can bypass or remove a shell hook; `GUARD_DISABLE=1` is an explicit bypass.
- Script files, sourced files, SQL files, heredocs, aliases, and shell functions may not be fully analyzed.
- Variables and substitutions can make targets differ from what the analyzer can infer. Such cases may be marked uncertain, depending on the syntax.
- Path checks operate on the typed path and do not follow symlinks or mount tricks. A preview can become stale before execution.
- Rules are not exhaustive. `ALLOW` means no known configured risk was found, not that execution is safe.
- A local LLM can be wrong or receive adversarial command text. It provides explanatory text only and cannot approve, downgrade, or block a command.

Use least-privilege accounts, backups, production credentials with restricted permissions, and appropriate operational controls. Full notes are in [Security notes](docs/security.md).

## Development and tests

```bash
npm install
npm run build
npm run lint
npm test                 # build + all Vitest unit/integration tests
npm run test:unit
npm run test:integration
npm run test:shell       # build + Bash/Zsh integration scripts
npm run test:all
```

The shell suite uses Git Bash on Windows, discovered automatically by `scripts/test-shell.cjs`. Set `GIT_BASH_EXE` if Git Bash is installed in a non-standard location. The Zsh suite skips if Zsh is unavailable; PTY cases require the platform's PTY support and test dependencies. Vitest may display a Vite config-loader warning; it is currently non-fatal.

When adding or changing a security rule, add a regression test alongside the relevant unit/integration tests. Run the full test suite after modifying parsing, policy, execution, or shell-hook behavior.

## Project layout

```text
src/
  analyzer/      Shell tokenizer, command catalog, command analysis
  rules/         Deterministic filesystem, Git, database, cloud, network, process, and shell rules
  policy/        Decision precedence and risk scoring
  execution/     Assessment, confirmation, previews, and command runner
  commands/      CLI commands and runtime dependencies
  config/        Schema, configuration loader, and defaults
  ai/            Ollama client, prompt builder, response parser, fallback explainer
  environment/   Environment and production-target detection
  logging/       Audit logger and command sanitizer
  shell/         Shell-hook installation and detection
  ui/            Terminal rendering and sanitization
integrations/
  bash/          Bash DEBUG-trap integration
  zsh/           Zsh accept-line integration
policies/        Built-in default, development, and production profiles
tests/
  unit/          Unit tests
  integration/   End-to-end and command workflow tests
  shell/         Bash/Zsh shell-hook integration tests
docs/            Architecture, security, setup guides, screenshots, test report
```

## Documentation

- [Installation notes](docs/installation.md)
- [Bash setup](docs/bash-setup.md)
- [Zsh setup](docs/zsh-setup.md)
- [Ollama setup](docs/ollama-setup.md)
- [Command policies and rule catalogue](docs/command-policies.md)
- [Architecture](docs/architecture.md)
- [Security notes and threat model](docs/security.md)
- [Screenshots](docs/screenshots/)
- [Test report](docs/test-report.txt)

## License

MIT. See [LICENSE](LICENSE).

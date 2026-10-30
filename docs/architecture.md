# Architecture

## Pipeline

1. **Tokenizer** (`src/analyzer/tokenizer.ts`): shell-aware splitting. Handles quotes, escapes, `|` `&&` `||` `;` `&`,
   redirections, `$VAR`, `${VAR}`, `$(...)`, backticks, globs, comments. Reports what it cannot model
   (heredocs, subshell grouping, unterminated quotes).
2. **Analyzer** (`commandAnalyzer.ts`): builds segments, unwraps `sudo`/`env`/`nice`/`timeout`, resolves the real
   executable, and creates *nested* analyses for `bash -c`, `eval`, `$(...)`, `find -exec`, `xargs`. Marks the result
   `uncertain` with reasons when it cannot be sure (variables as command names, script files, sourcing, depth > 3).
3. **Rule engine** (`src/rules/*`): pure functions `(segment, config, env) -> findings`. Categories: filesystem,
   permissions, git, database, cloud, network, process, privilege/shell. Same input = same output.
4. **Policy engine** (`src/policy/policyEngine.ts`): turns findings into ALLOW / WARN / CONFIRM / BLOCK. **It has no
   access to the LLM output.**
5. **Explanation** (`src/ai`): built-in explanations, or Ollama with a validated JSON answer. Display only.
6. **Execution controller** (`src/execution/executionController.ts`): print panel -> (preview) -> confirm -> run -> audit.
7. **Runner**: runs `argv` directly without a shell whenever the command has no shell syntax; otherwise
   `sh -c "<original text>"` (never rebuilt from pieces).

## Policy precedence

1. Blocked-command patterns, protected directories, hard-block findings (`block: true`) -> **BLOCK**
2. CRITICAL findings -> BLOCK (or CONFIRM if `blockCriticalOperations=false`; hard blocks stay blocked)
3. Mandatory confirmations (production targets) -> at least CONFIRM
4. Risk default: HIGH -> CONFIRM, MEDIUM -> WARN, LOW -> ALLOW
5. `defaultUnknownCommandPolicy` for unrecognised/unverifiable commands (a floor; never lowers)
6. `trustedCommands` (exact match) may lower CONFIRM to WARN, never 1-3

## Exit codes

| Context | Code | Meaning |
|---|---|---|
| `guard check` | 0 / 2 / 3 | allow-or-warn / confirmation needed / blocked |
| `guard run` | child's code | normal execution |
| `guard run` | 126 | blocked by policy |
| `guard run` | 130 | cancelled by the user |
| `guard run` | 127 | command not found |
| `guard hook-check` | 0 / 3 / other | let the shell run it / deny / the guard itself failed |
| any | 2 | usage or invalid configuration |

## Design decisions

- **Fail closed**: invalid config, broken hook, unusable block pattern, no terminal for a confirmation -> not executed.
- **AI is optional and untrusted**: output is schema-validated, length-limited, stripped of terminal escape codes.
  The command is wrapped in delimiters and declared to be data, not instructions.
- **Privacy**: raw commands are not logged by default; when enabled they are sanitised first.
- **No guessing production**: only explicit config (hosts, names, kube contexts, workspaces, profiles) marks production.

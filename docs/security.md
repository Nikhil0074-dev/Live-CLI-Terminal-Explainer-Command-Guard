# Security notes and threat model

## What it protects

Commands typed in a guarded interactive shell (hook) or launched via `guard run -- ...`.

## What it cannot protect

- Scripts, cron jobs, CI, IDE task runners, other shells, other terminal apps, direct system calls.
- Anything that unsets the hook (`trap - DEBUG`, `GUARD_DISABLE=1`, `zle -A .accept-line accept-line`).
  A hook is a safety net for honest mistakes, not a defence against a hostile user.
- Contents of script files, sourced files, SQL files, here-documents, aliases and shell functions.
- Symlinks and mount tricks: paths are checked as typed, not resolved on disk.
- Time-of-check/time-of-use: a preview can be stale by the time the command runs.

## Known gaps in the rules

Rule coverage is broad but not complete. Treat `ALLOW` as "no known risky pattern was found", never "safe".
Unrecognised tools default to `WARN` for exactly this reason; use `CONFIRM` or `BLOCK` in sensitive environments.

## AI risks and mitigations

| Risk | Mitigation |
|---|---|
| Model says "safe" for a dangerous command | Policy engine never reads model output |
| Prompt injection inside the command text | Command is delimited and labelled untrusted; output only displayed |
| Terminal escape sequences in model output | Stripped from every string; formatter escapes again on display |
| Oversized / malformed output | Zod schema, item and length limits, fallback on failure |
| Data leaving the machine | Ollama is local by default (`127.0.0.1`) |

## Privacy

- Raw commands are **not** logged by default. If enabled they pass through a redactor (passwords, tokens, URL credentials,
  cloud keys, bearer headers). Redaction is pattern-based and cannot catch every secret.
- Audit files are mode `0600` in a `0700` directory; `retentionDays` applies on `guard run` and `guard history --prune`.
- Command text is also sent to the local Ollama server when `--ai` or `guard explain` uses it.

## Hook-specific behaviour

- `GUARD_HOOK_FAIL=closed` (default): if the guard crashes, the command is skipped and the reason is printed.
- `GUARD_HOOK_MODE=risky` (default) only calls the guard when the line mentions a command or construct that has rules;
  `all` checks every line (slower: roughly one Node start-up per line).
- `--yes` (skip the prompt) works only when `security.allowYesFlag` is `true`, and never for BLOCK.

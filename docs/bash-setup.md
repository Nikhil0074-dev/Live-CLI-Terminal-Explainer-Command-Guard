# Bash setup

```bash
guard install-hook bash      # edits ~/.bashrc between marked lines, backup: ~/.bashrc.guard-backup
source ~/.bashrc
guard doctor
guard uninstall-hook bash    # removes only the marked block
```

How it works: `shopt -s extdebug` plus a `DEBUG` trap. For each typed line the trap calls `guard hook-check`.
A non-zero result makes Bash skip the command. In interactive shells the whole line is checked once (so `curl ... | bash`
is seen as a pipeline); commands not stored in history (leading space with `HISTCONTROL=ignorespace`) and non-interactive
shells are checked one simple command at a time.

Limits: it needs `extdebug`, which also traces functions; an existing `DEBUG` trap prevents installation (a notice is shown).
Scripts run by `bash script.sh` are not covered unless they `source` the hook.

Variables: `GUARD_HOOK_MODE=risky|all`, `GUARD_HOOK_FAIL=closed|open`, `GUARD_DISABLE=1`.

# Zsh setup

```zsh
guard install-hook zsh       # edits ~/.zshrc between marked lines, backup: ~/.zshrc.guard-backup
source ~/.zshrc
guard doctor
guard uninstall-hook zsh
```

How it works: the `accept-line` widget (the Enter key) is wrapped. The typed buffer is passed to `guard hook-check`;
if it is denied the buffer is cleared and the prompt is redrawn, otherwise the original `.accept-line` runs.

Limits: only lines accepted with Enter at an interactive prompt are covered (not `eval`, scripts, or widgets that
execute commands directly). If you rebind or wrap `accept-line` after the hook loads, load the hook last.

Variables: `GUARD_HOOK_MODE=risky|all`, `GUARD_HOOK_FAIL=closed|open`, `GUARD_DISABLE=1`.

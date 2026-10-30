#!/usr/bin/env bash
# Zsh integration tests: syntax, install/uninstall, and a real interactive zsh session in a pty (zle widgets need a terminal).
set -u
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
command -v zsh >/dev/null || { echo "SKIP: zsh is not installed"; exit 0; }
[ -f "$CLI" ] || { echo "Run 'npm run build' first"; exit 2; }
setup_sandbox
HOOK="$ROOT/integrations/zsh/guard.zsh"

# 6. install / uninstall restore the rc file exactly
printf 'export A=1\n' > "$T/rc"; cp "$T/rc" "$T/rc.orig"
"$NODE_BIN" "$CLI" install-hook zsh --rc-file "$T/rc" >/dev/null
check "zsh: install adds the block" 'grep -q "live-cli-guard" "$T/rc"'
"$NODE_BIN" "$CLI" install-hook zsh --rc-file "$T/rc" | grep -q "already installed"
check "zsh: install is idempotent" '[ "$(grep -c ">>> live-cli-guard" "$T/rc")" = 1 ]'
"$NODE_BIN" "$CLI" uninstall-hook zsh --rc-file "$T/rc" >/dev/null
check "zsh: uninstall restores the original file" 'cmp -s "$T/rc" "$T/rc.orig"'

# 7. the installed block references the zsh script and parses under zsh
"$NODE_BIN" "$CLI" install-hook zsh --rc-file "$T/rc2" >/dev/null
check "zsh: installed block points at guard.zsh" 'grep -q "integrations/zsh/guard.zsh" "$T/rc2"'
check "zsh: rc file and hook script parse without errors" 'zsh -n "$T/rc2" && zsh -n "$HOOK"'

# 8. real interactive zsh in a pseudo-terminal
if [[ "$(uname -s)" != MINGW* && "$(uname -s)" != MSYS* && "$(uname -s)" != CYGWIN* ]] && command -v python3 >/dev/null; then
  PTY_OUT="$(setsid timeout 120 python3 "$ROOT/tests/shell/pty_hook_test.py" zsh 2>&1)"
  echo "$PTY_OUT" | sed 's/^/  pty| /'
  check "zsh: interactive pty session (block, confirm n/y, usable afterwards)" 'echo "$PTY_OUT" | grep -q "ALL PASSED"'
else
  echo "SKIP pty test (python3 not available)"
fi
finish

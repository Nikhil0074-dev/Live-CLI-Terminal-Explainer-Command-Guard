#!/usr/bin/env bash
# Bash integration tests: non-interactive hook, install/uninstall, and a real interactive session in a pty.
set -u
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
[ -f "$CLI" ] || { echo "Run 'npm run build' first"; exit 2; }
setup_sandbox
HOOK="$ROOT/integrations/bash/guard.bash"

# 1. non-interactive: blocked command is skipped, later commands still run
OUT="$(bash -c "source '$HOOK'; rm -rf '$T/protected/data.txt'; echo after-block" 2>&1)"
check "bash(non-interactive): protected delete is skipped" '[ -f "$T/protected/data.txt" ]'
check "bash(non-interactive): block reason shown" 'echo "$OUT" | grep -q FS_PROTECTED_TARGET'
check "bash(non-interactive): shell keeps working after a block" 'echo "$OUT" | grep -q after-block'

# 2. harmless commands are untouched
OUT="$(bash -c "source '$HOOK'; echo plain; ls '$T' >/dev/null" 2>&1)"
check "bash(non-interactive): harmless commands run" '[ "$OUT" = "plain" ]'

# 3. CONFIRM with no terminal cancels (nothing deleted)
OUT="$(setsid bash -c "source '$HOOK'; rm -rf '$T/scratch'" 2>&1 </dev/null)"
check "bash: CONFIRM without a terminal cancels" '[ -f "$T/scratch/f.txt" ]'

# 4. GUARD_DISABLE bypass is explicit
bash -c "GUARD_DISABLE=1; source '$HOOK'; rm -rf '$T/protected/data.txt'" >/dev/null 2>&1
check "bash: GUARD_DISABLE=1 is the documented, visible bypass" '[ ! -f "$T/protected/data.txt" ]'
echo keep > "$T/protected/data.txt"

# 5. fail closed when the guard itself is broken
OUT="$(GUARD_CLI=/nonexistent.js bash -c "source '$HOOK'; rm -rf '$T/protected/data.txt'; echo next" 2>&1)"
check "bash: broken guard fails closed (command skipped)" '[ -f "$T/protected/data.txt" ]'
check "bash: broken guard explains itself" 'echo "$OUT" | grep -q "the guard itself failed"'

# 6. install / uninstall restore the rc file exactly
printf 'export A=1\n' > "$T/rc"; cp "$T/rc" "$T/rc.orig"
"$NODE_BIN" "$CLI" install-hook bash --rc-file "$T/rc" >/dev/null
check "bash: install adds the block" 'grep -q "live-cli-guard" "$T/rc"'
"$NODE_BIN" "$CLI" install-hook bash --rc-file "$T/rc" | grep -q "already installed"
check "bash: install is idempotent" '[ "$(grep -c ">>> live-cli-guard" "$T/rc")" = 1 ]'
"$NODE_BIN" "$CLI" uninstall-hook bash --rc-file "$T/rc" >/dev/null
check "bash: uninstall restores the original file" 'cmp -s "$T/rc" "$T/rc.orig"'

# 7. a freshly installed rc file really works in a new interactive-style shell
"$NODE_BIN" "$CLI" install-hook bash --rc-file "$T/rc2" >/dev/null
OUT="$(bash -c "source '$T/rc2'; rm -rf '$T/protected/data.txt'" 2>&1)"
check "bash: sourcing the installed rc enables protection" '[ -f "$T/protected/data.txt" ]'

# 8. real interactive bash in a pseudo-terminal
if [[ "$(uname -s)" != MINGW* && "$(uname -s)" != MSYS* && "$(uname -s)" != CYGWIN* ]] && command -v python3 >/dev/null; then
  PTY_OUT="$(setsid timeout 120 python3 "$ROOT/tests/shell/pty_hook_test.py" bash 2>&1)"
  echo "$PTY_OUT" | sed 's/^/  pty| /'
  check "bash: interactive pty session (block, confirm n/y, usable afterwards)" 'echo "$PTY_OUT" | grep -q "ALL PASSED"'
else
  echo "SKIP pty test (python3 not available)"
fi
finish

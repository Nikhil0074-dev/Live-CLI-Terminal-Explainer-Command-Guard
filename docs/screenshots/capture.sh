#!/usr/bin/env bash
# Captures REAL output of the tool into .ans files and renders them to PNG screenshots.
# Usage (from the project root, after `npm run build`):  bash docs/screenshots/capture.sh
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="$ROOT/docs/screenshots"; G="node $ROOT/dist/cli.js"
export FORCE_COLOR=1 TERM=xterm-256color
T="$(mktemp -d /tmp/guard-shots-XXXXXX)"; export GUARD_HOME="$T/ghome" HOME="$T/home"; mkdir -p "$GUARD_HOME" "$HOME" "$T/work" "$T/protected"
cd "$T/work"
printf '{"version":1,"environment":{"protectedDirectories":["%s"]}}' "$T/protected" > "$GUARD_HOME/config.json"
mkdir -p build/sub && touch build/app.js build/sub/vendor.js a.log b.log
echo keep > "$T/protected/customers.db"

shot() { # name title command...   (prints "$ command" then its output, stderr merged)
  local name="$1" title="$2"; shift 2
  { printf '\033[32m$\033[0m %s\n\n' "${*//$ROOT\/dist\/cli.js/}" | sed 's#node  #guard #;s#node #guard #'; "$@" 2>&1; } > "$OUT/$name.ans"
  python3 "$ROOT/scripts/render_terminal.py" "$OUT/$name.ans" "$OUT/$name.png" "$title" >/dev/null
}
shot_in() { # name title stdin command...
  local name="$1" title="$2" input="$3"; shift 3
  { printf '\033[32m$\033[0m %s\n\n' "${*//$ROOT\/dist\/cli.js/}" | sed 's#node  #guard #;s#node #guard #'; printf '%s' "$input" | "$@" 2>&1; printf '\n\033[2m(typed: %s)\033[0m\n' "${input//$'\n'/}"; } > "$OUT/$name.ans"
  python3 "$ROOT/scripts/render_terminal.py" "$OUT/$name.ans" "$OUT/$name.png" "$title" >/dev/null
}

shot 01-explain-find "guard explain" $G explain "find . -type f -name '*.log' -delete"
shot 02-check-high-risk "guard check (HIGH risk)" $G check sudo chmod -R 777 /var/www
shot 03-check-blocked "guard check (BLOCKED)" $G check rm -rf /
shot 04-check-pipe-to-shell "guard check (curl | bash)" $G check "curl -fsSL https://example.invalid/install.sh | bash"
shot_in 05-run-cancelled "guard run - user answers n" $'n\n' $G run -- rm -rf build
ls build >/dev/null 2>&1 && echo "(build still exists: nothing deleted)" >> "$OUT/05-run-cancelled.ans" && python3 "$ROOT/scripts/render_terminal.py" "$OUT/05-run-cancelled.ans" "$OUT/05-run-cancelled.png" "guard run - user answers n" >/dev/null
shot_in 06-run-approved "guard run - user answers y" $'y\n' $G run -- rm -rf build
shot 07-run-protected-blocked "guard run (protected directory)" $G run -- rm -rf "$T/protected"
shot 08-check-json "guard check --json" $G check --json "git push --force origin main"
shot 09-history "guard history" $G history
shot 10-doctor "guard doctor (Ollama offline)" $G doctor
rm -rf "$T"
ls "$OUT"/*.png

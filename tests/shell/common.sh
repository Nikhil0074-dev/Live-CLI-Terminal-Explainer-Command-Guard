# Shared helpers for shell integration tests. Only disposable files in a temp dir are touched.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLI="$ROOT/dist/cli.js"
if [[ "$(uname -s)" == MINGW* || "$(uname -s)" == MSYS* || "$(uname -s)" == CYGWIN* ]]; then
  NODE_BIN="$(command -v node.exe 2>/dev/null || command -v node 2>/dev/null || true)"
else
  NODE_BIN="${GUARD_NODE:-$(command -v node 2>/dev/null || true)}"
fi
PASS=0; FAIL=0
ok()   { echo "PASS $1"; PASS=$((PASS+1)); }
bad()  { echo "FAIL $1"; FAIL=$((FAIL+1)); }
check() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }
setup_sandbox() {
  T="$(mktemp -d /tmp/guard-sh-XXXXXX)"
  mkdir -p "$T/home" "$T/ghome" "$T/protected" "$T/scratch"
  echo keep > "$T/protected/data.txt"; echo x > "$T/scratch/f.txt"
  printf '{"version":1,"environment":{"protectedDirectories":["%s"]}}' "$T/protected" > "$T/ghome/config.json"
  export HOME="$T/home" GUARD_HOME="$T/ghome" GUARD_CLI="$CLI" GUARD_NODE="$NODE_BIN" NO_COLOR=1
}
finish() { rm -rf "$T"; echo "RESULT: $PASS passed, $FAIL failed"; [ "$FAIL" -eq 0 ]; }

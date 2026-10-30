# Live CLI Terminal Guard - Bash integration
#
# Source this file from ~/.bashrc (or run: guard install-hook bash).
# Every command is checked by `guard hook-check` BEFORE it runs. A blocked or
# cancelled command is skipped (this uses bash's `extdebug` + DEBUG trap).
#
# Honest limits: this protects commands typed in THIS interactive shell. Scripts,
# other shells, IDE task runners and `command`/`builtin` tricks can bypass it.
# For stronger guarantees use `guard run -- <command>`.
#
# Environment:
#   GUARD_CLI / GUARD_NODE   path to dist/cli.js and node (set by install-hook)
#   GUARD_HOOK_MODE=risky|all   "risky" (default) only calls the guard when the line
#                               mentions a command/construct worth checking
#   GUARD_HOOK_FAIL=closed|open what to do when the guard itself errors (default closed)
#   GUARD_DISABLE=1             bypass the hook for this shell (explicit, visible choice)

[[ -n "${_GUARD_LOADED:-}" ]] && return 0
_GUARD_LOADED=1

_guard_exec() {
  if [[ -n "${GUARD_CLI:-}" ]]; then
    "${GUARD_NODE:-node}" "$GUARD_CLI" "$@"
  else
    command guard "$@"
  fi
}

_GUARD_RISKY_RE='(^|[[:space:];&|(`])(sudo|doas|su|rm|rmdir|unlink|mv|cp|dd|mkfs[.a-z0-9]*|shred|truncate|wipefs|fdisk|parted|chmod|chown|chgrp|git|curl|wget|find|xargs|eval|source|bash|sh|zsh|dash|terraform|tofu|kubectl|helm|aws|gcloud|az|docker|podman|psql|mysql|mariadb|mongo|mongosh|redis-cli|sqlite3|dropdb|mysqladmin|prisma|rails|rake|knex|sequelize|kill|killall|pkill|shutdown|reboot|halt|poweroff|systemctl|service|crontab|iptables|ufw|rsync|nc|ncat|netcat|tee|sed|userdel|passwd|apt|apt-get|yum|dnf|brew|npx|npm|yarn|pnpm|\.|:)([[:space:]]|$)|>|\$\(|`|\./'

_guard_check_line() {
  local line="$1"
  [[ -n "${GUARD_DISABLE:-}" ]] && return 0
  [[ -z "${line//[[:space:]]/}" ]] && return 0
  if [[ "${GUARD_HOOK_MODE:-risky}" != "all" ]] && ! [[ "$line" =~ $_GUARD_RISKY_RE ]]; then
    return 0
  fi
  _GUARD_BUSY=1
  _guard_exec hook-check -- "$line"
  local rc=$?
  unset _GUARD_BUSY
  case $rc in
    0) return 0 ;;
    3) return 1 ;;
    *)
      echo "[guard] the guard itself failed (exit $rc)." >&2
      if [[ "${GUARD_HOOK_FAIL:-closed}" == "open" ]]; then
        echo "[guard] GUARD_HOOK_FAIL=open: running the command unchecked." >&2
        return 0
      fi
      echo "[guard] command skipped (set GUARD_HOOK_FAIL=open or GUARD_DISABLE=1 to bypass)." >&2
      return 1
      ;;
  esac
}

# State for interactive shells: check the whole typed line once, not each pipeline stage.
_GUARD_LINE_PENDING=""
_GUARD_LINE_CHECKED=""
_GUARD_LINE_RC=0
_GUARD_PROMPT_HISTCMD=""

_guard_debug_trap() {
  [[ -n "${_GUARD_BUSY:-}${_GUARD_IN_PROMPT:-}${COMP_LINE:-}" ]] && return 0
  case "$BASH_COMMAND" in _guard_*) return 0 ;; esac
  # extdebug also traces commands INSIDE functions: never intercept the guard's own helpers.
  local _f
  for _f in "${FUNCNAME[@]:1}"; do
    [[ "$_f" == _guard_* ]] && return 0
  done
  if [[ $- == *i* ]]; then
    if [[ -n "$_GUARD_LINE_CHECKED" ]]; then
      return $_GUARD_LINE_RC
    fi
    if [[ -n "$_GUARD_LINE_PENDING" && "$HISTCMD" != "$_GUARD_PROMPT_HISTCMD" ]]; then
      _GUARD_LINE_PENDING=""
      local line
      line="$(HISTTIMEFORMAT= builtin history 1 | sed -E 's/^[[:space:]]*[0-9]+[[:space:]]+//')"
      _guard_check_line "$line"
      _GUARD_LINE_RC=$?
      _GUARD_LINE_CHECKED=1
      return $_GUARD_LINE_RC
    fi
  fi
  # Non-interactive shells, or lines not recorded in history (HISTCONTROL=ignorespace): check each simple command.
  _guard_check_line "$BASH_COMMAND"
  return $?
}

_guard_prompt_begin() { _GUARD_IN_PROMPT=1; }
_guard_prompt_end() {
  unset _GUARD_IN_PROMPT
  _GUARD_LINE_CHECKED=""
  _GUARD_LINE_RC=0
  _GUARD_LINE_PENDING=1
  _GUARD_PROMPT_HISTCMD="$HISTCMD"
}

if [[ -n "$(trap -p DEBUG)" ]]; then
  echo "[guard] a DEBUG trap already exists; the Bash hook was not installed." >&2
else
  shopt -s extdebug
  trap '_guard_debug_trap' DEBUG
  if [[ $- == *i* ]]; then
    PROMPT_COMMAND="_guard_prompt_begin;${PROMPT_COMMAND:+${PROMPT_COMMAND};}_guard_prompt_end"
  fi
fi

# Live CLI Terminal Guard - Zsh integration
#
# Source this file from ~/.zshrc (or run: guard install-hook zsh).
# It wraps the Enter key (the accept-line widget): the typed line is checked by
# `guard hook-check` and is only executed when the guard allows it.
#
# Honest limits: protects commands typed at THIS interactive prompt. Scripts,
# other shells and IDE task runners can bypass it. For stronger guarantees use
# `guard run -- <command>`.
#
# Environment: GUARD_CLI, GUARD_NODE, GUARD_HOOK_MODE=risky|all, GUARD_HOOK_FAIL=closed|open, GUARD_DISABLE=1

[[ -n "${_GUARD_LOADED:-}" ]] && return 0
typeset -g _GUARD_LOADED=1

_guard_exec() {
  if [[ -n "${GUARD_CLI:-}" ]]; then
    "${GUARD_NODE:-node}" "$GUARD_CLI" "$@"
  else
    command guard "$@"
  fi
}

typeset -g _GUARD_RISKY_RE='(^|[[:space:];&|(`])(sudo|doas|su|rm|rmdir|unlink|mv|cp|dd|mkfs[.a-z0-9]*|shred|truncate|wipefs|fdisk|parted|chmod|chown|chgrp|git|curl|wget|find|xargs|eval|source|bash|sh|zsh|dash|terraform|tofu|kubectl|helm|aws|gcloud|az|docker|podman|psql|mysql|mariadb|mongo|mongosh|redis-cli|sqlite3|dropdb|mysqladmin|prisma|rails|rake|knex|sequelize|kill|killall|pkill|shutdown|reboot|halt|poweroff|systemctl|service|crontab|iptables|ufw|rsync|nc|ncat|netcat|tee|sed|userdel|passwd|apt|apt-get|yum|dnf|brew|npx|npm|yarn|pnpm|\.|:)([[:space:]]|$)|>|\$\(|`|\./'

_guard_check_line() {
  local line="$1"
  [[ -n "${GUARD_DISABLE:-}" ]] && return 0
  [[ -z "${line//[[:space:]]/}" ]] && return 0
  if [[ "${GUARD_HOOK_MODE:-risky}" != "all" ]] && ! [[ "$line" =~ $_GUARD_RISKY_RE ]]; then
    return 0
  fi
  _guard_exec hook-check -- "$line"
  local rc=$?
  case $rc in
    0) return 0 ;;
    3) return 1 ;;
    *)
      print -u2 "[guard] the guard itself failed (exit $rc)."
      if [[ "${GUARD_HOOK_FAIL:-closed}" == "open" ]]; then
        print -u2 "[guard] GUARD_HOOK_FAIL=open: running the command unchecked."
        return 0
      fi
      print -u2 "[guard] command skipped (set GUARD_HOOK_FAIL=open or GUARD_DISABLE=1 to bypass)."
      return 1
      ;;
  esac
}

_guard_accept_line() {
  if [[ -n "$BUFFER" ]]; then
    zle -I
    if ! _guard_check_line "$BUFFER"; then
      BUFFER=""
      zle reset-prompt
      return 0
    fi
  fi
  zle .accept-line
}
zle -N accept-line _guard_accept_line

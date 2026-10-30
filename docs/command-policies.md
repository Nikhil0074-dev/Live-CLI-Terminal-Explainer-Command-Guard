# Command policies

## Profiles (`policies/`)

| Profile | Unknown commands | Notes |
|---|---|---|
| `default` | WARN | Balanced |
| `development` | ALLOW | Fewer interruptions; HIGH risk still needs confirmation |
| `production` | CONFIRM | Hook checks every line; ships a blocklist (`terraform destroy*`, `git push --force*`, `git reset --hard*`, ...) |

Select one with `"policyProfile": "production"`. Arrays from a profile are **unioned** with your file, so a user
config cannot remove a profile's blocked commands.

## Blocked / trusted patterns

- Glob: `git push*` (only `*` is special, whole command must match)
- Regex: `regex:^npm (publish|unpublish)`
- Matched against the full line, each pipeline stage, and the command after `sudo`/`env` are removed,
  including nested `bash -c "..."`.
- An invalid regex is a configuration error; at runtime an unusable pattern is treated as a match (fail closed).
- `trustedCommands`: exact (whitespace-normalised) match only. Lowers CONFIRM to WARN. Never overrides a block or a
  production-target confirmation.

## Protected directories

`environment.protectedDirectories` entries are resolved (`~`, `..`, `.`, `//`). `rm`, `mv`, `cp` (destination),
`chmod`, `chown`, `dd of=`, `tee`, `sed -i`, `find -delete/-exec`, `truncate`, `shred`, `ln`, `rsync`, and `>` redirections
that touch them are **blocked**. Deleting or moving a parent directory that contains one is also blocked.
Reading is allowed. Symlinks are not followed (the check is on the typed path).

## Production targets

| Setting | Matched against |
|---|---|
| `productionDatabaseHosts` | host/URL in the arguments, or `PGHOST`/`DATABASE_URL`/... when no explicit host is given |
| `productionDatabaseNames` | database name arguments |
| `productionKubeContexts` | `--context X`, otherwise `current-context` read from the kubeconfig file |
| `productionTerraformWorkspaces` | `TF_WORKSPACE` |
| `productionCloudProfiles` / `productionCloudAccountIds` | `--profile`, `AWS_PROFILE`, 12-digit IDs in arguments |

Destructive or write operations on a production target are **BLOCK**; other operations require **CONFIRM**.

## Rule catalogue (IDs shown in findings and the audit log)

FS_ROOT_DELETE, FS_RECURSIVE_DELETE, FS_FORCE_DELETE, FS_DELETE_FILES, FS_UNRESOLVED_TARGET, FS_PROTECTED_TARGET,
FS_FIND_DELETE, FS_DISK_WRITE, FS_DISK_FORMAT, FS_OVERWRITE_REDIRECT, FS_SYSTEM_FILE_WRITE, PERM_RECURSIVE_CHMOD,
PERM_WORLD_WRITABLE, PERM_SETUID, PERM_SYSTEM_RECURSIVE, GIT_FORCE_PUSH, GIT_HARD_RESET, GIT_CLEAN,
GIT_DELETE_REMOTE_BRANCH, DB_DROP_TABLE, DB_DELETE_NO_WHERE, DB_PRODUCTION_WRITE, DB_PRODUCTION_CONNECT,
DB_MIGRATION_RESET, CLOUD_TERRAFORM_DESTROY, CLOUD_K8S_DELETE, CLOUD_AWS_DELETE, CLOUD_PRODUCTION_TARGET,
NET_PIPE_TO_SHELL, NET_REVERSE_SHELL, PROC_FORK_BOMB, PROC_SHUTDOWN, PRIV_ELEVATED, PRIV_ROOT_SHELL,
SHELL_UNCERTAIN, CMD_UNRECOGNIZED, POLICY_BLOCKED_COMMAND (and more; see `src/rules/`).

## Adding a rule

1. Add a function in the matching `src/rules/*.rules.ts` returning `finding(id, category, risk, reason, extras)`.
2. Add a row to `tests/fixtures/*-commands.json` or a case in `tests/unit/ruleEngine.test.ts`.
3. `npm test`.

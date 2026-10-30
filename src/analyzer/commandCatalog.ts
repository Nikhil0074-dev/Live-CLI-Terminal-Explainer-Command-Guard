/**
 * Catalogue of commands the guard "understands". A command outside this set is
 * reported as unrecognised and handled by the configured unknown-command policy.
 */

export const SHELL_INTERPRETERS = new Set(["sh", "bash", "zsh", "dash", "ksh", "fish", "ash", "csh", "tcsh"]);

export const OTHER_INTERPRETERS = new Set([
  "python",
  "python2",
  "python3",
  "perl",
  "ruby",
  "node",
  "php",
  "lua",
  "deno",
  "bun",
]);

/** Read-only or low-impact commands. */
export const READ_ONLY_COMMANDS = new Set([
  "ls", "ll", "la", "cat", "less", "more", "head", "tail", "pwd", "echo", "printf", "grep", "egrep", "fgrep",
  "rg", "wc", "which", "whereis", "type", "whoami", "id", "date", "uptime", "df", "du", "ps", "top", "htop",
  "stat", "file", "tree", "uname", "hostname", "env", "printenv", "sort", "uniq", "cut", "tr", "diff", "cmp",
  "basename", "dirname", "realpath", "readlink", "true", "false", "test", "[", "cd", "pushd", "popd", "export",
  "alias", "history", "man", "help", "clear", "sleep", "seq", "yes", "free", "lsof", "ping", "dig", "nslookup",
  "host", "md5sum", "sha1sum", "sha256sum", "cksum", "jq", "column", "nl", "tac", "rev", "fold", "expand",
  "xxd", "hexdump", "od", "strings", "lscpu", "lsblk",
]);

/** Everyday developer tools. Recognised, but not assumed read-only: specific rules still apply (e.g. git). */
export const DEV_TOOLS = new Set([
  "git", "node", "npm", "npx", "yarn", "pnpm", "python", "python3", "pip", "pip3", "make", "tsc", "vitest", "jest",
  "cargo", "go", "java", "javac", "mvn", "gradle", "code", "vim", "nano", "vi", "emacs",
]);

/** Commands that modify things, but that the rule engine understands. */
export const MODIFYING_COMMANDS = new Set([
  "rm", "rmdir", "unlink", "mv", "cp", "ln", "mkdir", "touch", "chmod", "chown", "chgrp", "dd", "shred", "truncate",
  "find", "xargs", "sed", "awk", "tee", "tar", "zip", "unzip", "gzip", "gunzip", "rsync", "scp", "sftp", "ssh",
  "curl", "wget", "sudo", "doas", "su", "kill", "killall", "pkill", "shutdown", "reboot", "halt", "poweroff",
  "systemctl", "service", "crontab", "iptables", "ufw", "nc", "ncat", "netcat", "docker", "docker-compose",
  "podman", "kubectl", "helm", "terraform", "tofu", "aws", "gcloud", "az", "psql", "mysql", "mariadb", "mongo",
  "mongosh", "redis-cli", "sqlite3", "dropdb", "createdb", "mysqladmin", "pg_dump", "pg_restore", "prisma",
  "rails", "rake", "knex", "sequelize", "mkfs", "fdisk", "parted", "wipefs", "mkswap", "umount", "apt", "apt-get",
  "yum", "dnf", "brew", "pacman", "snap", "eval", "exec", "source", ".", "bash", "sh", "zsh", "dash", "ksh",
  "passwd", "useradd", "userdel", "usermod", "groupdel", "visudo", "nohup", "env", "command", "time", "nice",
]);

export function isKnownCommand(name: string | null): boolean {
  if (!name) return false;
  if (name.startsWith("mkfs.")) return true;
  return READ_ONLY_COMMANDS.has(name) || DEV_TOOLS.has(name) || MODIFYING_COMMANDS.has(name);
}

/** sudo options that consume the following word. */
export const SUDO_ARG_OPTIONS = new Set(["-u", "-g", "-h", "-p", "-C", "-D", "-R", "-T", "-U", "-r", "-t"]);

export const SYSTEM_DIRS = [
  "/bin", "/boot", "/dev", "/etc", "/lib", "/lib32", "/lib64", "/proc", "/root", "/run", "/sbin", "/sys", "/usr",
  "/var", "/opt", "/srv", "/System", "/Library", "/Applications", "/private",
];

/** Directories whose own deletion/ownership change is considered catastrophic. */
export const CRITICAL_DIRS = new Set([
  "/", ...SYSTEM_DIRS, "/home", "/Users", "/mnt", "/media", "/tmp", "/var/lib", "/usr/bin", "/usr/lib", "/usr/local",
]);

import * as os from "node:os";
import * as path from "node:path";
import { CRITICAL_DIRS, SYSTEM_DIRS } from "../analyzer/commandCatalog";

// Risky paths use POSIX semantics; Windows drive paths are represented as /C:/... internally.
function posix(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  if (/^[A-Za-z]:\//.test(normalized)) return `/${normalized[0]}:${path.posix.normalize(normalized.slice(2))}`;
  if (/^\/[A-Za-z]:\//.test(normalized)) return `/${normalized[1]}:${path.posix.normalize(normalized.slice(3))}`;
  return path.posix.normalize(normalized);
}

function cwdPath(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  return /^[A-Za-z]:\//.test(normalized) ? `/${normalized[0]}:${normalized.slice(2)}` : normalized;
}

export function guardHome(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.GUARD_HOME;
  if (configured) {
    return /^[A-Za-z]:[\\/]/.test(configured) ? path.win32.resolve(configured) : path.posix.resolve(configured.replace(/\\/g, "/"));
  }
  const xdg = env.XDG_CONFIG_HOME;
  const base = xdg || path.posix.join((env.HOME || os.homedir()).replace(/\\/g, "/"), ".config");
  const normalized = base.replace(/\\/g, "/");
  return /^[A-Za-z]:\//.test(normalized)
    ? path.win32.join(normalized, "live-cli-guard")
    : path.posix.join(normalized, "live-cli-guard");
}

export function expandHome(p: string, home: string): string {
  const normalizedHome = home.replace(/\\/g, "/");
  if (p === "~") return normalizedHome;
  if (p.startsWith("~/")) return path.posix.join(normalizedHome, p.slice(2));
  if (p === "$HOME" || p === "${HOME}") return normalizedHome;
  if (p.startsWith("$HOME/")) return path.posix.join(normalizedHome, p.slice(6));
  if (p.startsWith("${HOME}/")) return path.posix.join(normalizedHome, p.slice(8));
  return p;
}

/** Resolve a user-typed path to an absolute, normalised POSIX path (no filesystem access). */
export function resolveTarget(p: string, cwd: string, home: string): string {
  const e = expandHome(p, home).replace(/\\/g, "/");
  const base = cwdPath(cwd);
  if (/^[A-Za-z]:\//.test(e)) return `/${e[0]}:${path.posix.normalize(e.slice(2))}`;
  if (/^\/[A-Za-z]:\//.test(base)) return path.posix.resolve(base, e);
  return path.posix.resolve(base, e);
}

/**
 * For a possibly-globbed argument, return the directory that the glob ranges over.
 * "build/*" -> "build", "*.log" -> ".", "/*" -> "/", "~/*" -> "~".
 */
export function globBase(value: string): string {
  const idx = value.search(/[*?[{]/);
  if (idx < 0) return value;
  const prefix = value.slice(0, idx);
  const slash = prefix.lastIndexOf("/");
  if (slash < 0) return ".";
  if (slash === 0) return "/";
  return prefix.slice(0, slash);
}

export function isWithin(parent: string, child: string): boolean {
  const parentPath = posix(parent);
  const childPath = posix(child);
  const rel = path.posix.relative(parentPath, childPath);
  return rel === "" || (!rel.startsWith("..") && !path.posix.isAbsolute(rel));
}

export function isCriticalPath(abs: string, home: string): boolean {
  const norm = posix(abs);
  return norm === posix(home) || [...CRITICAL_DIRS].some((p) => norm === posix(p));
}

export function isSystemArea(abs: string): boolean {
  const norm = posix(abs);
  return SYSTEM_DIRS.some((d) => isWithin(d, norm));
}

import * as fs from "node:fs";
import * as path from "node:path";
import { ZodError } from "zod";
import { guardHome } from "../utils/paths";
import { configSchema, GuardConfig } from "./configSchema";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export interface LoadOptions {
  env?: NodeJS.ProcessEnv;
  /** Directory holding policy profiles. Defaults to <package>/policies. */
  profilesDir?: string;
  /** Explicit config path (overrides GUARD_CONFIG / default). */
  configPath?: string;
}

export function packageRoot(): string {
  // works from both src/config (vitest) and dist/config (compiled)
  return path.resolve(__dirname, "..", "..");
}

export function defaultConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.GUARD_CONFIG ? path.resolve(env.GUARD_CONFIG) : path.join(guardHome(env), "config.json");
}

type Json = Record<string, unknown>;

function isPlainObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Merge b over a. Objects merge recursively; arrays are UNIONED (so a policy
 * profile's blocked commands cannot be removed by a user config); scalars from b win.
 */
export function mergeConfig(a: Json, b: Json): Json {
  const out: Json = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k];
    if (isPlainObject(cur) && isPlainObject(v)) out[k] = mergeConfig(cur, v);
    else if (Array.isArray(cur) && Array.isArray(v)) out[k] = [...new Set([...cur, ...v])];
    else out[k] = v;
  }
  return out;
}

function readJson(file: string, label: string): Json {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (e) {
    throw new ConfigError(`Cannot read ${label} (${file}): ${(e as Error).message}`);
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isPlainObject(parsed)) throw new Error("top-level value must be an object");
    return parsed;
  } catch (e) {
    throw new ConfigError(`Invalid JSON in ${label} (${file}): ${(e as Error).message}`);
  }
}

function resolveProfile(name: string, profilesDir: string): string {
  if (/^[A-Za-z0-9_-]+$/.test(name)) return path.join(profilesDir, `${name}.json`);
  return path.resolve(name);
}

export function formatZodError(err: ZodError): string {
  return err.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
}

/** Validate a plain object against the schema and return the typed config. */
export function parseConfig(obj: unknown): GuardConfig {
  const res = configSchema.safeParse(obj);
  if (!res.success) throw new ConfigError(`Configuration is invalid:\n${formatZodError(res.error)}`);
  for (const pattern of [...res.data.security.blockedCommands, ...res.data.security.trustedCommands]) {
    if (pattern.startsWith("regex:")) {
      try {
        new RegExp(pattern.slice(6));
      } catch (e) {
        throw new ConfigError(`Configuration is invalid:\n  - security pattern "${pattern}" is not a valid regular expression: ${(e as Error).message}`);
      }
    }
  }
  return res.data;
}

/**
 * Load configuration. Precedence (lowest to highest):
 * built-in defaults < policy profile < user config file.
 * A missing user file is fine; a present-but-invalid file is an error (fail closed).
 */
export function loadConfig(opts: LoadOptions = {}): { config: GuardConfig; path: string; exists: boolean } {
  const env = opts.env ?? process.env;
  const file = opts.configPath ? path.resolve(opts.configPath) : defaultConfigPath(env);
  const profilesDir = opts.profilesDir ?? path.join(packageRoot(), "policies");
  const exists = fs.existsSync(file);
  const user: Json = exists ? readJson(file, "configuration file") : {};
  let merged: Json = {};
  const profile = typeof user.policyProfile === "string" ? user.policyProfile : undefined;
  if (profile) {
    const pf = resolveProfile(profile, profilesDir);
    if (!fs.existsSync(pf)) throw new ConfigError(`Policy profile "${profile}" not found (${pf})`);
    merged = mergeConfig(merged, readJson(pf, `policy profile "${profile}"`));
  }
  merged = mergeConfig(merged, user);
  return { config: parseConfig(merged), path: file, exists };
}

/** A copy of the config that is safe to print (no credentials are stored, but be defensive). */
export function redactConfig(cfg: GuardConfig): GuardConfig {
  const clone: GuardConfig = JSON.parse(JSON.stringify(cfg));
  try {
    const u = new URL(clone.ai.baseUrl);
    if (u.username || u.password) {
      u.username = "***";
      u.password = "***";
      clone.ai.baseUrl = u.toString();
    }
  } catch {
    /* ignore */
  }
  return clone;
}

export function writeDefaultConfig(file: string, force = false): boolean {
  if (fs.existsSync(file) && !force) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const starter = {
    version: 1,
    policyProfile: "default",
    ai: { enabled: true, provider: "ollama", baseUrl: "http://127.0.0.1:11434", model: "YOUR_INSTALLED_MODEL" },
    security: { defaultUnknownCommandPolicy: "WARN", requireConfirmationForHighRisk: true, blockCriticalOperations: true },
    logging: { enabled: true, storeRawCommands: false, retentionDays: 90 },
    environment: { protectedDirectories: [], productionDatabaseHosts: [], productionCloudAccountIds: [] },
  };
  fs.writeFileSync(file, JSON.stringify(starter, null, 2) + "\n", { mode: 0o600 });
  return true;
}

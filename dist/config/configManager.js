"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigError = void 0;
exports.packageRoot = packageRoot;
exports.defaultConfigPath = defaultConfigPath;
exports.mergeConfig = mergeConfig;
exports.formatZodError = formatZodError;
exports.parseConfig = parseConfig;
exports.loadConfig = loadConfig;
exports.redactConfig = redactConfig;
exports.writeDefaultConfig = writeDefaultConfig;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const paths_1 = require("../utils/paths");
const configSchema_1 = require("./configSchema");
class ConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = "ConfigError";
    }
}
exports.ConfigError = ConfigError;
function packageRoot() {
    // works from both src/config (vitest) and dist/config (compiled)
    return path.resolve(__dirname, "..", "..");
}
function defaultConfigPath(env = process.env) {
    return env.GUARD_CONFIG ? path.resolve(env.GUARD_CONFIG) : path.join((0, paths_1.guardHome)(env), "config.json");
}
function isPlainObject(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}
/**
 * Merge b over a. Objects merge recursively; arrays are UNIONED (so a policy
 * profile's blocked commands cannot be removed by a user config); scalars from b win.
 */
function mergeConfig(a, b) {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) {
        const cur = out[k];
        if (isPlainObject(cur) && isPlainObject(v))
            out[k] = mergeConfig(cur, v);
        else if (Array.isArray(cur) && Array.isArray(v))
            out[k] = [...new Set([...cur, ...v])];
        else
            out[k] = v;
    }
    return out;
}
function readJson(file, label) {
    let text;
    try {
        text = fs.readFileSync(file, "utf8");
    }
    catch (e) {
        throw new ConfigError(`Cannot read ${label} (${file}): ${e.message}`);
    }
    try {
        const parsed = JSON.parse(text);
        if (!isPlainObject(parsed))
            throw new Error("top-level value must be an object");
        return parsed;
    }
    catch (e) {
        throw new ConfigError(`Invalid JSON in ${label} (${file}): ${e.message}`);
    }
}
function resolveProfile(name, profilesDir) {
    if (/^[A-Za-z0-9_-]+$/.test(name))
        return path.join(profilesDir, `${name}.json`);
    return path.resolve(name);
}
function formatZodError(err) {
    return err.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
}
/** Validate a plain object against the schema and return the typed config. */
function parseConfig(obj) {
    const res = configSchema_1.configSchema.safeParse(obj);
    if (!res.success)
        throw new ConfigError(`Configuration is invalid:\n${formatZodError(res.error)}`);
    for (const pattern of [...res.data.security.blockedCommands, ...res.data.security.trustedCommands]) {
        if (pattern.startsWith("regex:")) {
            try {
                new RegExp(pattern.slice(6));
            }
            catch (e) {
                throw new ConfigError(`Configuration is invalid:\n  - security pattern "${pattern}" is not a valid regular expression: ${e.message}`);
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
function loadConfig(opts = {}) {
    const env = opts.env ?? process.env;
    const file = opts.configPath ? path.resolve(opts.configPath) : defaultConfigPath(env);
    const profilesDir = opts.profilesDir ?? path.join(packageRoot(), "policies");
    const exists = fs.existsSync(file);
    const user = exists ? readJson(file, "configuration file") : {};
    let merged = {};
    const profile = typeof user.policyProfile === "string" ? user.policyProfile : undefined;
    if (profile) {
        const pf = resolveProfile(profile, profilesDir);
        if (!fs.existsSync(pf))
            throw new ConfigError(`Policy profile "${profile}" not found (${pf})`);
        merged = mergeConfig(merged, readJson(pf, `policy profile "${profile}"`));
    }
    merged = mergeConfig(merged, user);
    return { config: parseConfig(merged), path: file, exists };
}
/** A copy of the config that is safe to print (no credentials are stored, but be defensive). */
function redactConfig(cfg) {
    const clone = JSON.parse(JSON.stringify(cfg));
    try {
        const u = new URL(clone.ai.baseUrl);
        if (u.username || u.password) {
            u.username = "***";
            u.password = "***";
            clone.ai.baseUrl = u.toString();
        }
    }
    catch {
        /* ignore */
    }
    return clone;
}
function writeDefaultConfig(file, force = false) {
    if (fs.existsSync(file) && !force)
        return false;
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

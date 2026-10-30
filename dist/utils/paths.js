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
exports.guardHome = guardHome;
exports.expandHome = expandHome;
exports.resolveTarget = resolveTarget;
exports.globBase = globBase;
exports.isWithin = isWithin;
exports.isCriticalPath = isCriticalPath;
exports.isSystemArea = isSystemArea;
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
const commandCatalog_1 = require("../analyzer/commandCatalog");
// Risky paths use POSIX semantics; Windows drive paths are represented as /C:/... internally.
function posix(value) {
    const normalized = value.replace(/\\/g, "/");
    if (/^[A-Za-z]:\//.test(normalized))
        return `/${normalized[0]}:${path.posix.normalize(normalized.slice(2))}`;
    if (/^\/[A-Za-z]:\//.test(normalized))
        return `/${normalized[1]}:${path.posix.normalize(normalized.slice(3))}`;
    return path.posix.normalize(normalized);
}
function cwdPath(value) {
    const normalized = value.replace(/\\/g, "/");
    return /^[A-Za-z]:\//.test(normalized) ? `/${normalized[0]}:${normalized.slice(2)}` : normalized;
}
function guardHome(env = process.env) {
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
function expandHome(p, home) {
    const normalizedHome = home.replace(/\\/g, "/");
    if (p === "~")
        return normalizedHome;
    if (p.startsWith("~/"))
        return path.posix.join(normalizedHome, p.slice(2));
    if (p === "$HOME" || p === "${HOME}")
        return normalizedHome;
    if (p.startsWith("$HOME/"))
        return path.posix.join(normalizedHome, p.slice(6));
    if (p.startsWith("${HOME}/"))
        return path.posix.join(normalizedHome, p.slice(8));
    return p;
}
/** Resolve a user-typed path to an absolute, normalised POSIX path (no filesystem access). */
function resolveTarget(p, cwd, home) {
    const e = expandHome(p, home).replace(/\\/g, "/");
    const base = cwdPath(cwd);
    if (/^[A-Za-z]:\//.test(e))
        return `/${e[0]}:${path.posix.normalize(e.slice(2))}`;
    if (/^\/[A-Za-z]:\//.test(base))
        return path.posix.resolve(base, e);
    return path.posix.resolve(base, e);
}
/**
 * For a possibly-globbed argument, return the directory that the glob ranges over.
 * "build/*" -> "build", "*.log" -> ".", "/*" -> "/", "~/*" -> "~".
 */
function globBase(value) {
    const idx = value.search(/[*?[{]/);
    if (idx < 0)
        return value;
    const prefix = value.slice(0, idx);
    const slash = prefix.lastIndexOf("/");
    if (slash < 0)
        return ".";
    if (slash === 0)
        return "/";
    return prefix.slice(0, slash);
}
function isWithin(parent, child) {
    const parentPath = posix(parent);
    const childPath = posix(child);
    const rel = path.posix.relative(parentPath, childPath);
    return rel === "" || (!rel.startsWith("..") && !path.posix.isAbsolute(rel));
}
function isCriticalPath(abs, home) {
    const norm = posix(abs);
    return norm === posix(home) || [...commandCatalog_1.CRITICAL_DIRS].some((p) => norm === posix(p));
}
function isSystemArea(abs) {
    const norm = posix(abs);
    return commandCatalog_1.SYSTEM_DIRS.some((d) => isWithin(d, norm));
}

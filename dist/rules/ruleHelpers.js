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
exports.path = exports.isSystemArea = exports.isCriticalPath = void 0;
exports.parseArgs = parseArgs;
exports.hasFlag = hasFlag;
exports.finding = finding;
exports.resolveTargets = resolveTargets;
exports.matchesProtected = matchesProtected;
exports.containsHost = containsHost;
const path = __importStar(require("node:path"));
exports.path = path;
const paths_1 = require("../utils/paths");
Object.defineProperty(exports, "isCriticalPath", { enumerable: true, get: function () { return paths_1.isCriticalPath; } });
Object.defineProperty(exports, "isSystemArea", { enumerable: true, get: function () { return paths_1.isSystemArea; } });
/** Generic POSIX/GNU style argument parser. Flags with values are not modelled; callers handle those. */
function parseArgs(args) {
    const out = { short: new Set(), long: new Set(), longValues: new Map(), positionals: [], rawFlags: [] };
    let afterDD = false;
    for (const t of args) {
        const v = t.value;
        if (afterDD) {
            out.positionals.push(t);
            continue;
        }
        if (v === "--") {
            afterDD = true;
            continue;
        }
        if (v.startsWith("--") && v.length > 2) {
            const eq = v.indexOf("=");
            const name = eq > 0 ? v.slice(2, eq) : v.slice(2);
            out.long.add(name);
            if (eq > 0)
                out.longValues.set(name, v.slice(eq + 1));
            out.rawFlags.push(v);
        }
        else if (v.startsWith("-") && v.length > 1 && !/^-\d+$/.test(v)) {
            for (const ch of v.slice(1))
                out.short.add(ch);
            out.rawFlags.push(v);
        }
        else {
            out.positionals.push(t);
        }
    }
    return out;
}
function hasFlag(p, shortChars, longNames = []) {
    for (const ch of shortChars)
        if (p.short.has(ch))
            return true;
    return longNames.some((l) => p.long.has(l));
}
function finding(ruleId, category, risk, reason, extra = {}) {
    return { ruleId, category, risk, reason, requiresConfirmation: risk === "HIGH" || risk === "CRITICAL", ...extra };
}
/** Resolve positional path-like tokens to absolute paths (no filesystem access). */
function resolveTargets(tokens, ctx) {
    return tokens.map((t) => {
        const isHomeVar = /^\$\{?HOME\}?(\/|$)/.test(t.value);
        const unresolved = t.hasExpansion && !isHomeVar;
        const base = t.hasGlob ? (0, paths_1.globBase)(t.value) : t.value;
        const abs = (0, paths_1.resolveTarget)(base || ".", ctx.cwd, ctx.home);
        return { token: t, abs, isGlob: t.hasGlob, unresolved };
    });
}
function matchesProtected(abs, ctx, includeAncestors) {
    for (const p of ctx.config.environment.protectedDirectories) {
        const prot = (0, paths_1.resolveTarget)(p, ctx.cwd, ctx.home);
        if ((0, paths_1.isWithin)(prot, abs))
            return prot;
        if (includeAncestors && (0, paths_1.isWithin)(abs, prot))
            return prot;
    }
    return null;
}
function containsHost(text, hosts) {
    const lower = text.toLowerCase();
    for (const h of hosts)
        if (h && lower.includes(h.toLowerCase()))
            return h;
    return null;
}

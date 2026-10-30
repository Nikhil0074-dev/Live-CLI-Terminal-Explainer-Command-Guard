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
exports.AuditLogger = void 0;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const logSanitizer_1 = require("./logSanitizer");
class AuditLogger {
    file;
    opts;
    constructor(file, opts) {
        this.file = file;
        this.opts = opts;
    }
    now() {
        return this.opts.now ? this.opts.now() : new Date();
    }
    get path() {
        return this.file;
    }
    /** Never throws: a logging failure must not change a security decision. */
    write(rec, rawCommand) {
        if (!this.opts.enabled)
            return false;
        try {
            fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
            const full = { timestamp: this.now().toISOString(), ...rec };
            if (this.opts.storeRawCommands && rawCommand !== undefined)
                full.command = (0, logSanitizer_1.sanitizeCommand)(rawCommand);
            fs.appendFileSync(this.file, JSON.stringify(full) + "\n", { mode: 0o600 });
            try {
                fs.chmodSync(this.file, 0o600);
            }
            catch {
                /* best effort (e.g. Windows) */
            }
            return true;
        }
        catch {
            return false;
        }
    }
    read(limit = 20) {
        let text;
        try {
            text = fs.readFileSync(this.file, "utf8");
        }
        catch {
            return [];
        }
        const recs = [];
        for (const line of text.split("\n")) {
            if (!line.trim())
                continue;
            try {
                recs.push(JSON.parse(line));
            }
            catch {
                /* skip corrupt line */
            }
        }
        return limit > 0 ? recs.slice(-limit) : recs;
    }
    /** Remove records older than the retention period. Returns the number removed. */
    prune() {
        const all = this.read(0);
        if (all.length === 0)
            return 0;
        const cutoff = this.now().getTime() - this.opts.retentionDays * 86_400_000;
        const keep = all.filter((r) => Date.parse(r.timestamp) >= cutoff);
        const removed = all.length - keep.length;
        if (removed > 0) {
            try {
                fs.writeFileSync(this.file, keep.map((r) => JSON.stringify(r)).join("\n") + (keep.length ? "\n" : ""), { mode: 0o600 });
            }
            catch {
                return 0;
            }
        }
        return removed;
    }
}
exports.AuditLogger = AuditLogger;

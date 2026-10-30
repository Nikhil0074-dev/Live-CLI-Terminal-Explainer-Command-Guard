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
exports.detectEnvironment = detectEnvironment;
const fs = __importStar(require("node:fs"));
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
function defaultRead(p) {
    try {
        return fs.readFileSync(p, "utf8");
    }
    catch {
        return null;
    }
}
/**
 * Reads explicit environment metadata only (env vars and the kubeconfig
 * `current-context` line). It never runs kubectl/aws/terraform and never
 * guesses "production" from command text.
 */
function detectEnvironment(opts = {}) {
    const env = opts.env ?? process.env;
    const homePath = opts.home ?? env.HOME ?? process.env.HOME ?? os.homedir();
    const read = opts.readFile ?? defaultRead;
    let kubeContext = null;
    const kubeFiles = env.KUBECONFIG
        ? (env.KUBECONFIG.includes(";") ? env.KUBECONFIG.split(";") : env.KUBECONFIG.split(":")).filter(Boolean)
        : [path.join(homePath, ".kube", "config")];
    const normalizedKubeFiles = kubeFiles.map((file) => (process.platform === "win32" ? file.replace(/\\/g, "/") : file));
    for (const f of normalizedKubeFiles) {
        const text = read(f);
        if (text) {
            const m = /^current-context:\s*["']?([^\s"']+)["']?\s*$/m.exec(text);
            if (m) {
                kubeContext = m[1];
                break;
            }
        }
    }
    const databaseUrls = [];
    for (const k of ["DATABASE_URL", "DB_URL", "POSTGRES_URL", "MYSQL_URL", "MONGODB_URI", "REDIS_URL", "PGHOST", "MYSQL_HOST"]) {
        const v = env[k];
        if (v)
            databaseUrls.push(v);
    }
    return {
        kubeContext,
        terraformWorkspace: env.TF_WORKSPACE ?? null,
        awsProfile: env.AWS_PROFILE ?? env.AWS_DEFAULT_PROFILE ?? null,
        databaseUrls,
    };
}

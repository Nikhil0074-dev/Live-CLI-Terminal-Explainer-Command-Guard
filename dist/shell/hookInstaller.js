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
exports.END_MARK = exports.BEGIN_MARK = void 0;
exports.defaultRcFile = defaultRcFile;
exports.integrationScript = integrationScript;
exports.hookBlock = hookBlock;
exports.hasHook = hasHook;
exports.removeHookBlock = removeHookBlock;
exports.installHook = installHook;
exports.uninstallHook = uninstallHook;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const configManager_1 = require("../config/configManager");
exports.BEGIN_MARK = "# >>> live-cli-guard >>>";
exports.END_MARK = "# <<< live-cli-guard <<<";
function defaultRcFile(shell, home) {
    return path.join(home, shell === "bash" ? ".bashrc" : ".zshrc");
}
function integrationScript(shell) {
    return path.join((0, configManager_1.packageRoot)(), "integrations", shell, shell === "bash" ? "guard.bash" : "guard.zsh");
}
function shq(s) {
    return "'" + s.replace(/'/g, `'\\''`) + "'";
}
function hookBlock(shell, nodePath, cliPath) {
    return [
        exports.BEGIN_MARK,
        `export GUARD_NODE=${shq(nodePath)}`,
        `export GUARD_CLI=${shq(cliPath)}`,
        `[ -f ${shq(integrationScript(shell))} ] && source ${shq(integrationScript(shell))}`,
        exports.END_MARK,
        "",
    ].join("\n");
}
function hasHook(rcText) {
    return rcText.includes(exports.BEGIN_MARK) && rcText.includes(exports.END_MARK);
}
function removeHookBlock(rcText) {
    const start = rcText.indexOf(exports.BEGIN_MARK);
    const end = rcText.indexOf(exports.END_MARK);
    if (start < 0 || end < start)
        return rcText;
    const after = rcText.slice(end + exports.END_MARK.length).replace(/^\r?\n/, "");
    return rcText.slice(0, start) + after;
}
function installHook(shell, rcFile, nodePath, cliPath) {
    let text = "";
    try {
        text = fs.readFileSync(rcFile, "utf8");
    }
    catch {
        /* new file */
    }
    if (hasHook(text))
        return { changed: false, rcFile };
    let backup;
    if (text) {
        backup = rcFile + ".guard-backup";
        if (!fs.existsSync(backup))
            fs.writeFileSync(backup, text);
    }
    const sep = text && !text.endsWith("\n") ? "\n" : "";
    fs.writeFileSync(rcFile, text + sep + hookBlock(shell, nodePath, cliPath));
    return { changed: true, rcFile, backup };
}
function uninstallHook(rcFile) {
    let text;
    try {
        text = fs.readFileSync(rcFile, "utf8");
    }
    catch {
        return { changed: false, rcFile };
    }
    if (!hasHook(text))
        return { changed: false, rcFile };
    fs.writeFileSync(rcFile, removeHookBlock(text));
    return { changed: true, rcFile };
}

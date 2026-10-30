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
exports.configShow = configShow;
exports.configPath = configPath;
exports.configInit = configInit;
const fs = __importStar(require("node:fs"));
const configManager_1 = require("../config/configManager");
const runtime_1 = require("./runtime");
const configManager_2 = require("../config/configManager");
function configShow(io) {
    const rt = (0, runtime_1.buildRuntime)(io);
    io.stdout(`# source: ${fs.existsSync(rt.configPath) ? rt.configPath : "built-in defaults (no file at " + rt.configPath + ")"}\n`);
    io.stdout(JSON.stringify((0, configManager_1.redactConfig)(rt.config), null, 2) + "\n");
    return 0;
}
function configPath(io) {
    io.stdout((0, configManager_2.defaultConfigPath)(io.env) + "\n");
    return 0;
}
function configInit(io, force) {
    const file = (0, configManager_2.defaultConfigPath)(io.env);
    const created = (0, configManager_1.writeDefaultConfig)(file, force);
    io.stdout(created ? `Created ${file}\n` : `Config already exists: ${file} (use --force to overwrite)\n`);
    return created ? 0 : 1;
}

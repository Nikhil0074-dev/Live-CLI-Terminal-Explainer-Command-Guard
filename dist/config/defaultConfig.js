"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultConfig = defaultConfig;
const configSchema_1 = require("./configSchema");
function defaultConfig() {
    return configSchema_1.configSchema.parse({});
}

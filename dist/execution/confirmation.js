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
exports.createLineReader = createLineReader;
exports.askConfirmation = askConfirmation;
const readline = __importStar(require("node:readline"));
/** A single reader for a stream, so several prompts can share one stdin without losing buffered input. */
function createLineReader(input) {
    const rl = readline.createInterface({ input, terminal: false, crlfDelay: Infinity });
    const queue = [];
    const waiters = [];
    let closed = false;
    rl.on("line", (l) => {
        const w = waiters.shift();
        if (w)
            w(l);
        else
            queue.push(l);
    });
    rl.on("close", () => {
        closed = true;
        while (waiters.length)
            waiters.shift()(null);
    });
    return {
        readLine() {
            if (queue.length)
                return Promise.resolve(queue.shift());
            if (closed)
                return Promise.resolve(null);
            return new Promise((resolve) => waiters.push(resolve));
        },
        close() {
            rl.close();
        },
    };
}
/**
 * Ask a yes/no question. ONLY "y"/"yes" means yes. Enter, anything else, or end of input means no.
 * "e"/"explain" asks for more detail.
 */
async function askConfirmation(reader, write, question) {
    write(question);
    const line = await reader.readLine();
    write("\n");
    if (line === null)
        return "no";
    const a = line.trim().toLowerCase();
    if (a === "y" || a === "yes")
        return "yes";
    if (a === "e" || a === "explain")
        return "explain";
    return "no";
}

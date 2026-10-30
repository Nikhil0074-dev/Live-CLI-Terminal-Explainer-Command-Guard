"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanText = cleanText;
exports.parseExplanation = parseExplanation;
const zod_1 = require("zod");
const MAX_STR = 400;
const MAX_ITEMS = 20;
const schema = zod_1.z.object({
    summary: zod_1.z.string().min(1),
    flags: zod_1.z.array(zod_1.z.object({ flag: zod_1.z.string(), meaning: zod_1.z.string() })).default([]),
    sideEffects: zod_1.z.array(zod_1.z.string()).default([]),
    uncertainties: zod_1.z.array(zod_1.z.string()).default([]),
});
/**
 * Model text is untrusted: strip terminal control characters (ANSI escape
 * injection), limit length, and drop anything that is not a plain string.
 */
function cleanText(s) {
    return s
        .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
        .replace(/\u001b[\]P^_][^\u0007\u001b]*(\u0007|\u001b\\)?/g, "")
        .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "")
        .trim()
        .slice(0, MAX_STR);
}
function stripFences(text) {
    const t = text.trim();
    const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t);
    return m ? m[1] : t;
}
/** Returns a validated, sanitised Explanation, or null when the model output is unusable. */
function parseExplanation(text) {
    let obj;
    try {
        obj = JSON.parse(stripFences(text));
    }
    catch {
        // try to find the first {...} block
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start < 0 || end <= start)
            return null;
        try {
            obj = JSON.parse(text.slice(start, end + 1));
        }
        catch {
            return null;
        }
    }
    const res = schema.safeParse(obj);
    if (!res.success)
        return null;
    const d = res.data;
    return {
        source: "ai",
        summary: cleanText(d.summary),
        flags: d.flags.slice(0, MAX_ITEMS).map((f) => ({ flag: cleanText(f.flag), meaning: cleanText(f.meaning) })),
        sideEffects: d.sideEffects.slice(0, MAX_ITEMS).map(cleanText).filter(Boolean),
        uncertainties: d.uncertainties.slice(0, MAX_ITEMS).map(cleanText).filter(Boolean),
    };
}

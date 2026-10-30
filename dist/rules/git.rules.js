"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gitRules = void 0;
exports.gitSubcommand = gitSubcommand;
const ruleHelpers_1 = require("./ruleHelpers");
const PROTECTED_BRANCHES = /^(\+?)(main|master|develop|production|prod|release(\/.*)?|trunk)$/;
function gitSubcommand(args) {
    let i = 0;
    while (i < args.length) {
        const v = args[i].value;
        if (["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--super-prefix"].includes(v)) {
            i += 2;
            continue;
        }
        if (v.startsWith("-")) {
            i++;
            continue;
        }
        break;
    }
    return { sub: i < args.length ? args[i].value : null, rest: args.slice(i + 1) };
}
const gitRules = (ctx) => {
    const s = ctx.segment;
    if (s.executable !== "git")
        return [];
    const { sub, rest } = gitSubcommand(s.args);
    if (!sub)
        return [];
    const p = (0, ruleHelpers_1.parseArgs)(rest);
    const out = [];
    const pos = p.positionals.map((t) => t.value);
    switch (sub) {
        case "push": {
            const force = (0, ruleHelpers_1.hasFlag)(p, "f", ["force"]);
            const lease = p.long.has("force-with-lease") || p.long.has("force-if-includes");
            const refspecs = pos.slice(1);
            const plusRef = refspecs.some((r) => r.startsWith("+"));
            const onProtected = refspecs.some((r) => PROTECTED_BRANCHES.test(r.replace(/^.*:/, ""))) || refspecs.length === 0;
            const del = (0, ruleHelpers_1.hasFlag)(p, "d", ["delete"]) || refspecs.some((r) => r.startsWith(":"));
            if (force || plusRef) {
                out.push((0, ruleHelpers_1.finding)("GIT_FORCE_PUSH", "git", "HIGH", "A force push can overwrite remote history and discard other people's commits." +
                    (refspecs.some((r) => PROTECTED_BRANCHES.test(r.replace(/^.*:/, ""))) ? " The target looks like a shared branch." : ""), { target: refspecs.join(" ") || undefined }));
            }
            else if (lease) {
                out.push((0, ruleHelpers_1.finding)("GIT_FORCE_WITH_LEASE", "git", onProtected && refspecs.length > 0 ? "HIGH" : "MEDIUM", "--force-with-lease is safer than --force but still rewrites remote history."));
            }
            if (p.long.has("mirror")) {
                out.push((0, ruleHelpers_1.finding)("GIT_PUSH_MIRROR", "git", "HIGH", "git push --mirror makes the remote an exact copy of this repository and deletes remote-only refs."));
            }
            if (del) {
                out.push((0, ruleHelpers_1.finding)("GIT_DELETE_REMOTE_BRANCH", "git", "HIGH", "This deletes a branch or tag on the remote."));
            }
            break;
        }
        case "reset":
            if (p.long.has("hard")) {
                out.push((0, ruleHelpers_1.finding)("GIT_HARD_RESET", "git", "HIGH", "git reset --hard discards uncommitted changes in tracked files and moves the branch pointer."));
            }
            break;
        case "clean": {
            const force = (0, ruleHelpers_1.hasFlag)(p, "f", ["force"]);
            const dry = (0, ruleHelpers_1.hasFlag)(p, "n", ["dry-run"]);
            if (force && !dry) {
                const parts = [];
                if (p.short.has("d"))
                    parts.push("directories");
                if (p.short.has("x") || p.short.has("X"))
                    parts.push("ignored files");
                out.push((0, ruleHelpers_1.finding)("GIT_CLEAN", "git", "HIGH", `git clean permanently deletes untracked files${parts.length ? ` (including ${parts.join(" and ")})` : ""}.`));
            }
            break;
        }
        case "checkout":
        case "restore":
        case "switch": {
            const discardAll = pos.includes(".") || pos.includes(":/") || p.long.has("force") || p.short.has("f") || p.long.has("discard-changes");
            if (discardAll)
                out.push((0, ruleHelpers_1.finding)("GIT_DISCARD_CHANGES", "git", "MEDIUM", "This discards local changes in your working tree."));
            break;
        }
        case "rebase":
            out.push((0, ruleHelpers_1.finding)("GIT_REWRITE_HISTORY", "git", "MEDIUM", "git rebase rewrites commits; avoid it on commits others already have."));
            break;
        case "commit":
            if (p.long.has("amend"))
                out.push((0, ruleHelpers_1.finding)("GIT_AMEND", "git", "MEDIUM", "--amend replaces the previous commit."));
            break;
        case "filter-branch":
        case "filter-repo":
            out.push((0, ruleHelpers_1.finding)("GIT_FILTER_HISTORY", "git", "HIGH", `git ${sub} rewrites the entire repository history.`));
            break;
        case "branch":
            if (p.short.has("D") || (p.long.has("delete") && p.long.has("force"))) {
                out.push((0, ruleHelpers_1.finding)("GIT_DELETE_BRANCH_FORCE", "git", "MEDIUM", "Force-deleting a branch can lose commits that are not merged."));
            }
            break;
        case "stash":
            if (pos[0] === "drop" || pos[0] === "clear") {
                out.push((0, ruleHelpers_1.finding)("GIT_STASH_DROP", "git", "MEDIUM", `git stash ${pos[0]} permanently removes stashed changes.`));
            }
            break;
        case "reflog":
            if (pos[0] === "expire" || pos[0] === "delete") {
                out.push((0, ruleHelpers_1.finding)("GIT_PRUNE", "git", "HIGH", "Expiring the reflog removes the safety net used to recover lost commits."));
            }
            break;
        case "gc":
        case "prune": {
            const prune = p.longValues.get("prune");
            if (sub === "prune" || prune === "now" || p.long.has("aggressive")) {
                out.push((0, ruleHelpers_1.finding)("GIT_PRUNE", "git", sub === "prune" || prune === "now" ? "HIGH" : "MEDIUM", "Pruning permanently removes unreachable objects."));
            }
            break;
        }
        default:
            break;
    }
    return out;
};
exports.gitRules = gitRules;

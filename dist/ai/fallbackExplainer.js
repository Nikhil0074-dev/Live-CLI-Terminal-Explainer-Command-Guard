"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.explainDeterministic = explainDeterministic;
exports.knownFacts = knownFacts;
const git_rules_1 = require("../rules/git.rules");
const DOCS = {
    rm: {
        summary: "Delete files or directories",
        flags: {
            "-r": "Recurse into directories and delete everything inside",
            "-R": "Recurse into directories and delete everything inside",
            "--recursive": "Recurse into directories and delete everything inside",
            "-f": "Never prompt; ignore files that do not exist",
            "--force": "Never prompt; ignore files that do not exist",
            "-i": "Ask before every removal",
            "-v": "Print each file as it is removed",
            "-d": "Remove empty directories",
            "--no-preserve-root": "Turn off the safeguard that refuses to delete /",
        },
        effects: ["Deleted files do not go to the trash and are normally not recoverable."],
        describeTargets: true,
    },
    rmdir: { summary: "Remove empty directories", describeTargets: true },
    cp: {
        summary: "Copy files or directories",
        flags: { "-r": "Copy directories recursively", "-R": "Copy directories recursively", "-f": "Overwrite existing destination files", "-i": "Ask before overwriting", "-v": "Print each file copied", "-p": "Keep mode, ownership and timestamps", "-a": "Archive mode: recursive and keep attributes" },
        effects: ["Existing destination files may be overwritten."],
        describeTargets: true,
    },
    mv: {
        summary: "Move or rename files",
        flags: { "-f": "Overwrite without asking", "-i": "Ask before overwriting", "-n": "Never overwrite", "-v": "Print each move" },
        effects: ["An existing destination may be overwritten."],
        describeTargets: true,
    },
    ls: { summary: "List directory contents", flags: { "-l": "Long format", "-a": "Include hidden files", "-h": "Human-readable sizes", "-R": "List subdirectories recursively", "-t": "Sort by modification time", "-1": "One entry per line" }, describeTargets: true },
    cat: { summary: "Print file contents", describeTargets: true },
    mkdir: { summary: "Create directories", flags: { "-p": "Create parent directories as needed and do not fail if it exists", "-v": "Print each directory created" }, describeTargets: true },
    touch: { summary: "Create an empty file or update its timestamp", describeTargets: true },
    echo: { summary: "Print text", flags: { "-n": "Do not print the trailing newline", "-e": "Interpret backslash escapes" } },
    pwd: { summary: "Print the current directory" },
    cd: { summary: "Change the current directory" },
    chmod: {
        summary: "Change file permissions",
        flags: { "-R": "Apply the change to every file below the directory", "--recursive": "Apply the change to every file below the directory", "-v": "Print each change", "-c": "Print only changes", "-f": "Suppress most errors" },
    },
    chown: { summary: "Change file owner (and optionally group)", flags: { "-R": "Apply the change to every file below the directory", "-v": "Print each change", "-h": "Affect symlinks themselves" } },
    chgrp: { summary: "Change file group", flags: { "-R": "Apply the change to every file below the directory" } },
    grep: { summary: "Search text for lines matching a pattern", flags: { "-r": "Search directories recursively", "-R": "Search directories recursively", "-i": "Ignore case", "-n": "Show line numbers", "-v": "Invert match", "-l": "List only file names", "-E": "Extended regular expressions", "-w": "Match whole words", "-c": "Count matches" } },
    find: { summary: "Search a directory tree for files matching conditions" },
    sudo: { summary: "Run a command with administrator (root) privileges", flags: { "-u": "Run as the given user", "-i": "Start a login shell as root", "-s": "Start a shell as root", "-E": "Keep your environment variables" } },
    curl: { summary: "Transfer data from or to a URL", flags: { "-f": "Fail on HTTP errors", "-s": "Silent mode", "-S": "Show errors even in silent mode", "-L": "Follow redirects", "-o": "Write output to a file", "-O": "Save using the remote file name", "-k": "Skip TLS certificate verification", "--insecure": "Skip TLS certificate verification", "-X": "HTTP method to use", "-d": "Send request body data", "-H": "Add a request header", "-I": "Fetch headers only" } },
    wget: { summary: "Download files from a URL", flags: { "-O": "Write to the named file", "-q": "Quiet", "-c": "Continue a partial download", "--no-check-certificate": "Skip TLS certificate verification" } },
    tar: { summary: "Create or extract archives", flags: { "-x": "Extract", "-c": "Create an archive", "-z": "Use gzip", "-f": "Archive file name follows", "-v": "Verbose", "-t": "List contents" }, effects: ["Extracting can overwrite existing files."] },
    dd: { summary: "Copy raw data between files or devices", effects: ["Writing to the wrong target can destroy data instantly."] },
    kill: { summary: "Send a signal to a process", flags: { "-9": "SIGKILL: stop immediately, no cleanup", "-15": "SIGTERM: ask the process to exit", "-TERM": "SIGTERM: ask the process to exit", "-KILL": "SIGKILL: stop immediately, no cleanup" } },
    killall: { summary: "Send a signal to all processes with a given name" },
    pkill: { summary: "Send a signal to processes matching a pattern" },
    head: { summary: "Print the first lines of a file", flags: { "-n": "Number of lines" } },
    tail: { summary: "Print the last lines of a file", flags: { "-n": "Number of lines", "-f": "Keep following new output" } },
    wc: { summary: "Count lines, words and bytes", flags: { "-l": "Count lines", "-w": "Count words", "-c": "Count bytes" } },
    ps: { summary: "List running processes" },
    df: { summary: "Show free disk space", flags: { "-h": "Human-readable sizes" } },
    du: { summary: "Show disk usage of files and directories", flags: { "-h": "Human-readable sizes", "-s": "Only a total for each argument" } },
    whoami: { summary: "Print the current user name" },
    date: { summary: "Print or set the date and time" },
    ssh: { summary: "Open a secure shell on a remote machine", flags: { "-i": "Identity (private key) file", "-p": "Remote port", "-L": "Forward a local port", "-N": "Do not run a remote command" } },
    rsync: { summary: "Synchronise files between locations", flags: { "-a": "Archive mode", "-v": "Verbose", "-z": "Compress during transfer", "--delete": "Delete destination files that do not exist in the source", "-n": "Dry run: show what would change", "--dry-run": "Dry run: show what would change" } },
    shred: { summary: "Overwrite a file so it cannot be recovered", effects: ["Data is intentionally unrecoverable."] },
    truncate: { summary: "Shrink or extend a file to a given size", flags: { "-s": "Target size" } },
    shutdown: { summary: "Power off or restart the machine" },
    reboot: { summary: "Restart the machine" },
    eval: { summary: "Run text as a shell command", effects: ["What it does depends entirely on the text it receives at run time."] },
    docker: { summary: "Manage containers and images" },
    kubectl: { summary: "Control a Kubernetes cluster" },
    terraform: { summary: "Plan and apply infrastructure as code" },
    aws: { summary: "Control Amazon Web Services from the command line" },
    psql: { summary: "Run SQL against a PostgreSQL database", flags: { "-c": "Run the given SQL command and exit", "-h": "Database host", "-U": "Database user", "-d": "Database name", "-f": "Run SQL from a file" } },
    mysql: { summary: "Run SQL against a MySQL/MariaDB database", flags: { "-e": "Run the given SQL and exit", "-h": "Database host", "-u": "Database user" } },
    npm: { summary: "Node.js package manager" },
    node: { summary: "Run a JavaScript file" },
    python3: { summary: "Run a Python script" },
    python: { summary: "Run a Python script" },
    make: { summary: "Run build targets from a Makefile" },
};
const GIT_SUBS = {
    status: "Show the state of the working tree",
    log: "Show commit history",
    diff: "Show changes between commits, the index and the working tree",
    add: "Stage changes for the next commit",
    commit: "Record staged changes as a new commit",
    push: "Upload local commits to a remote repository",
    pull: "Fetch from a remote and merge into the current branch",
    fetch: "Download objects and refs from a remote without merging",
    clone: "Copy a repository",
    branch: "List, create or delete branches",
    checkout: "Switch branches or restore files",
    switch: "Switch branches",
    restore: "Restore working tree files",
    merge: "Join two histories together",
    rebase: "Re-apply commits on top of another base (rewrites history)",
    reset: "Move the current branch and optionally the index/working tree",
    clean: "Remove untracked files",
    stash: "Temporarily shelve changes",
    tag: "Create, list or delete tags",
    remote: "Manage remote repositories",
    show: "Show a commit or object",
    init: "Create a new repository",
    reflog: "Show the history of where HEAD pointed",
    gc: "Clean up unnecessary files and optimise the repository",
};
const GIT_FLAGS = {
    "--force": "Overwrite the remote even if it discards others' commits",
    "-f": "Force the operation",
    "--force-with-lease": "Force, but only if the remote has not changed unexpectedly",
    "--hard": "Also discard working-tree changes",
    "--soft": "Keep changes staged",
    "--amend": "Replace the previous commit",
    "-d": "Delete (or include directories for git clean)",
    "-D": "Force-delete the branch",
    "-x": "Also remove files ignored by .gitignore",
    "-n": "Dry run: show what would happen",
    "--dry-run": "Dry run: show what would happen",
    "-u": "Set the upstream branch",
    "--delete": "Delete the remote branch or tag",
    "-m": "Commit message follows",
    "-a": "Include all tracked changes",
    "--mirror": "Make the remote an exact mirror of this repository",
};
const OP_PHRASE = {
    "|": "its output is piped into",
    "|&": "its output and errors are piped into",
    "&&": "then, only if that succeeds,",
    "||": "or, if that fails,",
    ";": "then",
    "&": "in the background, then",
};
function flagLookup(table, flag) {
    if (!table)
        return undefined;
    return table[flag];
}
function explainFlags(seg, doc) {
    const out = [];
    const cmd = seg.executable;
    if (!cmd)
        return out;
    const table = cmd === "git" ? GIT_FLAGS : doc?.flags;
    if (cmd === "chmod") {
        const mode = seg.args.find((t) => !t.value.startsWith("-") || /^-[ugoa]*[-+=]/.test(t.value) || /^-[rwxXst]+$/.test(t.value));
        if (mode)
            out.push({ flag: mode.value, meaning: describeChmodMode(mode.value) });
    }
    if (cmd === "find")
        return explainFind(seg);
    let afterDD = false;
    for (const t of seg.args) {
        const v = t.value;
        if (afterDD)
            continue;
        if (v === "--") {
            afterDD = true;
            continue;
        }
        if (cmd === "chmod" && out.some((o) => o.flag === v))
            continue;
        if (v.startsWith("--")) {
            const key = v.includes("=") ? v.slice(0, v.indexOf("=")) : v;
            const m = flagLookup(table, key);
            out.push({ flag: v, meaning: m ?? "(no built-in description for this option)" });
        }
        else if (v.startsWith("-") && v.length > 1) {
            const whole = flagLookup(table, v);
            if (whole) {
                out.push({ flag: v, meaning: whole });
            }
            else if (v.length > 2 && !/^-\d+$/.test(v)) {
                for (const ch of v.slice(1)) {
                    const m = flagLookup(table, "-" + ch);
                    out.push({ flag: "-" + ch + (v.length > 2 ? ` (in ${v})` : ""), meaning: m ?? "(no built-in description for this option)" });
                }
            }
            else {
                out.push({ flag: v, meaning: "(no built-in description for this option)" });
            }
        }
        else if (doc?.describeTargets && cmd !== "git") {
            out.push({ flag: v, meaning: t.hasGlob ? "Target pattern (expanded by the shell to matching names)" : t.hasExpansion ? "Target (value comes from a variable or substitution)" : "Target" });
        }
    }
    return out;
}
function describeChmodMode(mode) {
    if (/^[0-7]{3,4}$/.test(mode)) {
        const names = ["no access", "execute", "write", "write+execute", "read", "read+execute", "read+write", "read+write+execute"];
        const d = mode.slice(-3).split("").map((c) => parseInt(c, 8));
        return `Numeric mode: owner ${names[d[0]]}, group ${names[d[1]]}, others ${names[d[2]]}`;
    }
    return "Symbolic permission change";
}
function explainFind(seg) {
    const out = [];
    const a = seg.args.map((t) => t.value);
    let i = 0;
    const starts = [];
    while (i < a.length && !a[i].startsWith("-") && a[i] !== "(" && a[i] !== "!")
        starts.push(a[i++]);
    out.push({ flag: starts.length ? starts.join(" ") : ".", meaning: "Where to start searching (default is the current directory)" });
    while (i < a.length) {
        const v = a[i];
        const next = a[i + 1];
        switch (v) {
            case "-type":
                out.push({ flag: `-type ${next}`, meaning: next === "f" ? "Match regular files" : next === "d" ? "Match directories" : next === "l" ? "Match symbolic links" : "Match this file type" });
                i += 2;
                break;
            case "-name":
                out.push({ flag: `-name ${next}`, meaning: `Match names that fit the pattern ${next} (case-sensitive)` });
                i += 2;
                break;
            case "-iname":
                out.push({ flag: `-iname ${next}`, meaning: `Match names that fit the pattern ${next} (ignoring case)` });
                i += 2;
                break;
            case "-mtime":
                out.push({ flag: `-mtime ${next}`, meaning: `Match by modification age in days (${next})` });
                i += 2;
                break;
            case "-size":
                out.push({ flag: `-size ${next}`, meaning: `Match by size (${next})` });
                i += 2;
                break;
            case "-maxdepth":
            case "-mindepth":
                out.push({ flag: `${v} ${next}`, meaning: v === "-maxdepth" ? `Do not go deeper than ${next} levels` : `Ignore matches shallower than ${next} levels` });
                i += 2;
                break;
            case "-delete":
                out.push({ flag: "-delete", meaning: "Delete every match" });
                i++;
                break;
            case "-print":
                out.push({ flag: "-print", meaning: "Print each match" });
                i++;
                break;
            case "-exec":
            case "-execdir": {
                const cmd = [];
                let j = i + 1;
                while (j < a.length && a[j] !== ";" && a[j] !== "\\;" && a[j] !== "+")
                    cmd.push(a[j++]);
                out.push({ flag: `${v} ${cmd.join(" ")}`, meaning: "Run this command on every match" });
                i = j + 1;
                break;
            }
            default:
                out.push({ flag: v, meaning: "(no built-in description for this expression)" });
                i++;
        }
    }
    return out;
}
function summarizeSegment(seg) {
    const cmd = seg.executable;
    if (!cmd) {
        if (Object.keys(seg.env).length)
            return { text: "set environment variables", known: true };
        return { text: "redirect only", known: true };
    }
    if (cmd === "git") {
        const { sub } = (0, git_rules_1.gitSubcommand)(seg.args);
        if (sub && GIT_SUBS[sub])
            return { text: `git ${sub}: ${GIT_SUBS[sub].toLowerCase()}`, known: true };
        return { text: `git ${sub ?? ""}`.trim(), known: sub !== null && Boolean(GIT_SUBS[sub ?? ""]) };
    }
    if (cmd.startsWith("mkfs"))
        return { text: "create a new filesystem (erasing the device)", known: true };
    const doc = DOCS[cmd];
    if (!doc)
        return { text: "", known: false };
    let text = doc.summary.charAt(0).toLowerCase() + doc.summary.slice(1);
    if (cmd === "find") {
        const a = seg.args.map((t) => t.value);
        if (a.includes("-delete"))
            text = "search a directory tree and delete every match";
        else if (a.some((x) => x === "-exec" || x === "-execdir"))
            text = "search a directory tree and run a command on every match";
    }
    if (cmd === "kubectl" || cmd === "terraform" || cmd === "docker" || cmd === "aws") {
        const sub = seg.args.find((t) => !t.value.startsWith("-"));
        if (sub)
            text += ` (subcommand: ${sub.value})`;
    }
    return { text, known: true };
}
/** Plain-language explanation that needs no AI. */
function explainDeterministic(analysis, findings = [], aiNote) {
    const parts = [];
    const flags = [];
    const effects = [];
    const uncertainties = [];
    const unknown = [];
    analysis.segments.forEach((seg, idx) => {
        const sum = summarizeSegment(seg);
        const prefix = idx === 0 ? "" : (OP_PHRASE[seg.operatorBefore ?? ";"] ?? "then") + " ";
        if (seg.wrappers.includes("sudo") || seg.wrappers.includes("doas")) {
            flags.push({ flag: seg.wrappers.find((w) => w === "sudo" || w === "doas"), meaning: "Run the command with administrator (root) privileges" });
        }
        if (seg.wrappers.includes("env"))
            flags.push({ flag: "env", meaning: "Run the command with modified environment variables" });
        if (!sum.known && seg.executable) {
            unknown.push(seg.executable);
            parts.push(`${prefix}run \`${seg.executable}\` (no built-in description)`);
            return;
        }
        parts.push(`${prefix}${sum.text}`);
        const doc = seg.executable ? DOCS[seg.executable] : undefined;
        if (seg.executable === "git") {
            const { sub, rest } = (0, git_rules_1.gitSubcommand)(seg.args);
            for (const t of rest) {
                if (t.value.startsWith("-"))
                    flags.push({ flag: t.value, meaning: GIT_FLAGS[t.value] ?? "(no built-in description for this option)" });
                else if (sub)
                    flags.push({ flag: t.value, meaning: "Argument" });
            }
        }
        else {
            flags.push(...explainFlags(seg, doc));
        }
        if (doc?.effects)
            effects.push(...doc.effects);
        for (const r of seg.redirections) {
            const op = r.op.endsWith(">>") ? "Append output to" : r.op.includes(">") ? "Write (overwrite) output to" : "Read input from";
            flags.push({ flag: `${r.op} ${r.target}`, meaning: `${op} ${r.target}` });
        }
    });
    let summary;
    if (analysis.segments.length === 0)
        summary = "Nothing to run.";
    else if (unknown.length === analysis.segments.length && analysis.segments.length === 1) {
        summary = `No reliable explanation is available: the guard has no built-in description of \`${unknown[0]}\`.`;
    }
    else {
        const joined = parts.join(" ");
        summary = joined.charAt(0).toUpperCase() + joined.slice(1) + ".";
    }
    void findings; // findings are displayed separately; the explanation stays descriptive
    for (const u of unknown)
        uncertainties.push(`No built-in description for \`${u}\`; the guard did not analyse what it does.`);
    const reasons = new Set();
    const walk = (a) => {
        a.uncertaintyReasons.forEach((r) => reasons.add(r));
        a.nested.forEach(walk);
    };
    walk(analysis);
    uncertainties.push(...reasons);
    return { source: "fallback", summary, flags, sideEffects: effects, uncertainties, aiNote };
}
/** Compact, factual description of known commands, passed to the LLM as grounding. */
function knownFacts(analysis) {
    const facts = [];
    for (const seg of analysis.segments) {
        const s = summarizeSegment(seg);
        if (s.known && s.text)
            facts.push(`${seg.executable ?? "command"}: ${s.text}`);
    }
    return facts;
}

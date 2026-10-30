"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.networkRules = void 0;
const commandCatalog_1 = require("../analyzer/commandCatalog");
const ruleHelpers_1 = require("./ruleHelpers");
const networkRules = (ctx) => {
    const s = ctx.segment;
    const cmd = s.executable;
    const out = [];
    const args = s.args.map((t) => t.value);
    const joined = args.join(" ");
    // download piped into an interpreter: curl ... | bash
    const idx = ctx.analysis.segments.indexOf(s);
    if (idx > 0 && (s.operatorBefore === "|" || s.operatorBefore === "|&") && cmd) {
        const prev = ctx.analysis.segments[idx - 1];
        const fetcher = prev.executable === "curl" || prev.executable === "wget" || prev.executable === "fetch";
        const interp = commandCatalog_1.SHELL_INTERPRETERS.has(cmd) || /^(python[0-9.]*|perl|ruby|node|php)$/.test(cmd);
        if (fetcher && interp) {
            out.push((0, ruleHelpers_1.finding)("NET_PIPE_TO_SHELL", "network", "HIGH", "Remote content is downloaded and executed immediately, without you reading it first."));
        }
    }
    // reverse shell indicators
    const raw = s.raw;
    if (/\/dev\/(tcp|udp)\//.test(raw) || ((cmd === "nc" || cmd === "ncat" || cmd === "netcat") && args.some((a) => /^-[a-z]*[ec]$/.test(a) || a === "--exec" || a === "--sh-exec"))) {
        out.push((0, ruleHelpers_1.finding)("NET_REVERSE_SHELL", "network", "CRITICAL", "This pattern opens a network connection that gives a remote machine a shell.", { block: true }));
    }
    if ((cmd === "nc" || cmd === "ncat" || cmd === "netcat") && args.some((a) => a === "-l" || /^-[a-z]*l[a-z]*$/.test(a))) {
        out.push((0, ruleHelpers_1.finding)("NET_LISTENER", "network", "MEDIUM", "This opens a listening network port."));
    }
    if (cmd === "curl" && args.some((a) => a === "-k" || a === "--insecure")) {
        out.push((0, ruleHelpers_1.finding)("NET_INSECURE_TLS", "network", "MEDIUM", "TLS certificate verification is disabled, so the connection can be intercepted."));
    }
    if (cmd === "wget" && args.includes("--no-check-certificate")) {
        out.push((0, ruleHelpers_1.finding)("NET_INSECURE_TLS", "network", "MEDIUM", "TLS certificate verification is disabled, so the connection can be intercepted."));
    }
    if (cmd === "iptables" || cmd === "ip6tables" || cmd === "nft") {
        if (args.some((a) => a === "-F" || a === "--flush" || a === "flush") || /-P\s+\w+\s+ACCEPT/.test(joined)) {
            out.push((0, ruleHelpers_1.finding)("NET_FIREWALL_CHANGE", "network", "HIGH", "This removes firewall rules or opens the default policy."));
        }
    }
    if (cmd === "ufw" && args.some((a) => a === "disable" || a === "reset")) {
        out.push((0, ruleHelpers_1.finding)("NET_FIREWALL_CHANGE", "network", "HIGH", "This turns off or resets the firewall."));
    }
    return out;
};
exports.networkRules = networkRules;

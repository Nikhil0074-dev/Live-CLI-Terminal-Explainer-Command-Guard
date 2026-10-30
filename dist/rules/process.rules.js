"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processRules = void 0;
exports.analysisLevelProcessFindings = analysisLevelProcessFindings;
const ruleHelpers_1 = require("./ruleHelpers");
const FORK_BOMB_RE = /:\s*\(\s*\)\s*\{[^}]*:\s*\|\s*:\s*&[^}]*\}\s*;?\s*:|(\b\w+)\s*\(\s*\)\s*\{\s*\1\s*\|\s*\1\s*&\s*\}/;
/** Rules that look at the whole command text rather than one segment. */
function analysisLevelProcessFindings(raw) {
    if (FORK_BOMB_RE.test(raw)) {
        return [(0, ruleHelpers_1.finding)("PROC_FORK_BOMB", "process", "CRITICAL", "This is a fork bomb: it spawns processes until the machine becomes unusable.", { block: true })];
    }
    return [];
}
const processRules = (ctx) => {
    const s = ctx.segment;
    const cmd = s.executable;
    if (!cmd)
        return [];
    const out = [];
    const args = s.args.map((t) => t.value);
    switch (cmd) {
        case "shutdown":
        case "reboot":
        case "halt":
        case "poweroff":
            out.push((0, ruleHelpers_1.finding)("PROC_SHUTDOWN", "process", "HIGH", `${cmd} stops or restarts the whole machine.`));
            break;
        case "kill": {
            const pids = args.filter((a) => /^-?\d+$/.test(a) && !/^-(9|15|1|2|3|6|0)$/.test(a));
            if (args.includes("-1") && args.some((a) => /^-(9|KILL|SIGKILL)$/.test(a) || a === "-s")) {
                out.push((0, ruleHelpers_1.finding)("PROC_KILL_ALL", "process", "HIGH", "kill -9 -1 terminates every process you are allowed to signal."));
            }
            else if (pids.some((p) => p === "1")) {
                out.push((0, ruleHelpers_1.finding)("PROC_KILL_INIT", "process", "HIGH", "PID 1 is the init/system manager; killing it can crash the system."));
            }
            break;
        }
        case "killall":
        case "pkill":
            out.push((0, ruleHelpers_1.finding)("PROC_KILL_BY_NAME", "process", "MEDIUM", `${cmd} stops every process whose name matches, which may include unrelated programs.`));
            break;
        case "systemctl":
        case "service": {
            const verbs = args.filter((a) => !a.startsWith("-"));
            const verb = cmd === "service" ? verbs[1] : verbs[0];
            if (["poweroff", "reboot", "halt", "kexec"].includes(verb ?? "")) {
                out.push((0, ruleHelpers_1.finding)("PROC_SHUTDOWN", "process", "HIGH", `systemctl ${verb} stops or restarts the whole machine.`));
            }
            else if (["stop", "disable", "mask", "kill", "restart"].includes(verb ?? "")) {
                out.push((0, ruleHelpers_1.finding)("PROC_SERVICE_CHANGE", "process", "MEDIUM", `This ${verb}s a system service.`));
            }
            break;
        }
        case "crontab":
            if (args.includes("-r"))
                out.push((0, ruleHelpers_1.finding)("PROC_CRONTAB_REMOVE", "process", "HIGH", "crontab -r deletes ALL scheduled jobs for the user without asking."));
            break;
        case "userdel":
        case "groupdel":
        case "deluser":
            out.push((0, ruleHelpers_1.finding)("PROC_ACCOUNT_DELETE", "process", "HIGH", `${cmd} removes a system account or group.`));
            break;
        case "passwd":
        case "usermod":
        case "useradd":
        case "visudo":
            out.push((0, ruleHelpers_1.finding)("PROC_ACCOUNT_CHANGE", "process", "MEDIUM", `${cmd} changes account or privilege settings.`));
            break;
        case "apt":
        case "apt-get":
        case "yum":
        case "dnf":
        case "pacman":
        case "brew":
        case "snap": {
            if (args.some((a) => ["remove", "purge", "autoremove", "erase", "uninstall", "-R", "-Rns", "-Rs"].includes(a))) {
                out.push((0, ruleHelpers_1.finding)("PROC_PACKAGE_REMOVE", "process", "MEDIUM", "This removes installed software and possibly its configuration."));
            }
            break;
        }
        default:
            break;
    }
    return out;
};
exports.processRules = processRules;

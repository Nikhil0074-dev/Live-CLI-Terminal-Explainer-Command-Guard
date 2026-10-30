import * as fs from "node:fs";
import * as path from "node:path";
import { OllamaClient } from "../ai/ollamaClient";
import { analyzeCommand } from "../analyzer/commandAnalyzer";
import { loadConfig, ConfigError } from "../config/configManager";
import { evaluatePolicy } from "../policy/policyEngine";
import { evaluateRules } from "../rules/ruleEngine";
import { BEGIN_MARK, defaultRcFile } from "../shell/hookInstaller";
import { paint, colorEnabled } from "../ui/terminalFormatter";
import { auditPath, CliIO } from "./runtime";

interface Check {
  name: string;
  ok: boolean;
  detail: string;
  optional: boolean;
}

/** Verifies the installation. Mandatory security components and optional AI are reported separately. */
export async function doctorCommand(io: CliIO): Promise<number> {
  const checks: Check[] = [];
  const major = Number(process.versions.node.split(".")[0]);
  checks.push({ name: "Node.js >= 18", ok: major >= 18, detail: `found ${process.versions.node}`, optional: false });

  let cfgOk = false;
  let cfg: ReturnType<typeof loadConfig> | null = null;
  try {
    cfg = loadConfig({ env: io.env });
    cfgOk = true;
    checks.push({ name: "Configuration", ok: true, detail: cfg.exists ? cfg.path : `defaults (no file at ${cfg.path})`, optional: false });
  } catch (e) {
    checks.push({ name: "Configuration", ok: false, detail: (e as ConfigError).message.split("\n")[0], optional: false });
  }

  if (cfg) {
    const a = analyzeCommand("rm -rf /");
    const p = evaluatePolicy(a, evaluateRules(a, { config: cfg.config, cwd: io.cwd, env: io.env }), cfg.config);
    checks.push({ name: "Rule engine self-test (rm -rf / is blocked)", ok: p.decision === "BLOCK", detail: `decision ${p.decision}`, optional: false });
    const b = analyzeCommand("ls");
    const q = evaluatePolicy(b, evaluateRules(b, { config: cfg.config, cwd: io.cwd, env: io.env }), cfg.config);
    checks.push({ name: "Rule engine self-test (ls is allowed)", ok: q.decision === "ALLOW", detail: `decision ${q.decision}`, optional: false });

    if (cfg.config.logging.enabled) {
      const file = auditPath(cfg.config, io.env);
      let ok = false;
      let detail = file;
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
        fs.accessSync(path.dirname(file), fs.constants.W_OK);
        ok = true;
      } catch (e) {
        detail = `${file}: ${(e as Error).message}`;
      }
      checks.push({ name: "Audit log writable", ok, detail, optional: false });
    }

    const home = io.env.HOME ?? "";
    for (const sh of ["bash", "zsh"] as const) {
      let installed = false;
      try {
        installed = fs.readFileSync(defaultRcFile(sh, home), "utf8").includes(BEGIN_MARK);
      } catch {
        /* none */
      }
      checks.push({ name: `${sh} hook installed`, ok: installed, detail: installed ? defaultRcFile(sh, home) : `run: guard install-hook ${sh}`, optional: true });
    }

    if (cfg.config.ai.enabled) {
      const client = new OllamaClient({ baseUrl: cfg.config.ai.baseUrl, model: cfg.config.ai.model, timeoutMs: 2000, fetchImpl: io.fetchImpl });
      let up = false;
      let models: string[] = [];
      try {
        models = await client.listModels();
        up = true;
      } catch {
        /* offline */
      }
      checks.push({ name: "Ollama reachable", ok: up, detail: up ? cfg.config.ai.baseUrl : `not reachable at ${cfg.config.ai.baseUrl} (explanations fall back to built-in text)`, optional: true });
      if (up) {
        const has = models.includes(cfg.config.ai.model);
        checks.push({ name: `Model "${cfg.config.ai.model}" installed`, ok: has, detail: has ? "yes" : `not found; installed: ${models.join(", ") || "none"}`, optional: true });
      }
    } else {
      checks.push({ name: "AI explanations", ok: true, detail: "disabled in configuration", optional: true });
    }
  }

  const st = { color: colorEnabled({ isTTY: io.stdoutIsTTY }, io.env) };
  io.stdout(paint(st, "bold", "Command Guard doctor") + "\n\n");
  for (const c of checks) {
    const mark = c.ok ? paint(st, "green", "[ OK ]") : c.optional ? paint(st, "yellow", "[ -- ]") : paint(st, "red", "[FAIL]");
    io.stdout(`${mark} ${c.name}${c.optional ? paint(st, "dim", " (optional)") : ""}\n       ${c.detail}\n`);
  }
  const failed = checks.filter((c) => !c.ok && !c.optional);
  io.stdout(`\n${failed.length === 0 ? "All required security components are working." : `${failed.length} required check(s) failed.`}\n`);
  return cfgOk && failed.length === 0 ? 0 : 1;
}

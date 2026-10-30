const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function resolveBash() {
  if (process.platform !== "win32") return "bash";

  const candidates = [
    process.env.GIT_BASH_EXE,
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, "Git", "bin", "bash.exe"),
    process.env["ProgramFiles(x86)"] && path.join(process.env["ProgramFiles(x86)"], "Git", "bin", "bash.exe"),
  ].filter(Boolean);
  const gitBash = candidates.find((candidate) => fs.existsSync(candidate));
  if (!gitBash) {
    throw new Error("Git Bash was not found. Install Git for Windows or set GIT_BASH_EXE to its bash.exe path.");
  }
  return gitBash;
}

let bash;
try {
  bash = resolveBash();
} catch (error) {
  console.error(`Shell integration tests cannot start: ${error.message}`);
  process.exit(1);
}

const env = { ...process.env };
if (process.platform === "win32") {
  const nodeDir = path.dirname(process.execPath);
  env.PATH = `${nodeDir}${path.delimiter}${env.PATH ?? ""}`;
}

for (const script of ["tests/shell/bash.integration.test.sh", "tests/shell/zsh.integration.test.sh"]) {
  const result = spawnSync(bash, [script], { cwd: process.cwd(), env, stdio: "inherit" });
  if (result.error) {
    console.error(`Could not run ${script}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

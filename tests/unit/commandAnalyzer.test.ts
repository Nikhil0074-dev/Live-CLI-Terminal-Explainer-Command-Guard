import { describe, expect, it } from "vitest";
import { allUncertaintyReasons, allUnrecognized, analyzeArgv, analyzeCommand, collectSegments } from "../../src/analyzer/commandAnalyzer";

describe("commandAnalyzer", () => {
  it("identifies executable, args and flags for a simple command", () => {
    const a = analyzeCommand("rm -rf ./build");
    const s = a.segments[0];
    expect(s.executable).toBe("rm");
    expect(s.args.map((t) => t.value)).toEqual(["-rf", "./build"]);
    expect(s.known).toBe(true);
    expect(a.needsShell).toBe(false);
    expect(a.uncertain).toBe(false);
  });

  it("unwraps sudo and records privilege", () => {
    const s = analyzeCommand("sudo -u deploy chmod -R 777 /var/www").segments[0];
    expect(s.privileged).toBe(true);
    expect(s.executable).toBe("chmod");
    expect(s.wrappers).toContain("sudo");
    expect(s.args.map((t) => t.value)).toEqual(["-R", "777", "/var/www"]);
  });

  it("unwraps env, nice and timeout wrappers and inline assignments", () => {
    const s = analyzeCommand("FOO=1 env BAR=2 nice -n 5 timeout 10 rm x").segments[0];
    expect(s.executable).toBe("rm");
    expect(s.env).toMatchObject({ FOO: "1", BAR: "2" });
  });

  it("normalises absolute executable paths", () => {
    expect(analyzeCommand("/bin/rm -rf x").segments[0].executable).toBe("rm");
  });

  it("detects pipe-to-shell from a downloader", () => {
    expect(analyzeCommand("curl -fsSL https://x.invalid/i.sh | bash").pipeToShell).toBe(true);
    expect(analyzeCommand("cat a | grep b").pipeToShell).toBe(false);
  });

  it("analyses nested shell -c scripts", () => {
    const a = analyzeCommand('bash -c "rm -rf /tmp/x"');
    expect(a.nested).toHaveLength(1);
    expect(a.nested[0].nestedVia).toBe("bash -c");
    expect(collectSegments(a).some((x) => x.segment.executable === "rm")).toBe(true);
  });

  it("analyses command substitutions", () => {
    const a = analyzeCommand("echo $(rm -rf x)");
    expect(collectSegments(a).some((x) => x.segment.executable === "rm")).toBe(true);
    expect(allUncertaintyReasons(a).join()).toMatch(/substitution/i);
  });

  it("analyses find -exec and xargs payloads", () => {
    const a = analyzeCommand("find . -name '*.o' -exec rm -f {} \\;");
    expect(collectSegments(a).some((x) => x.segment.executable === "rm")).toBe(true);
    const b = analyzeCommand("ls | xargs rm -rf");
    expect(collectSegments(b).some((x) => x.segment.executable === "rm")).toBe(true);
  });

  it("marks eval, sourcing and script files as uncertain", () => {
    expect(analyzeCommand('eval "$X"').uncertain).toBe(true);
    expect(analyzeCommand("source ./env.sh").uncertain).toBe(true);
    expect(analyzeCommand("./deploy.sh").uncertain).toBe(true);
    expect(analyzeCommand("bash install.sh").uncertain).toBe(true);
  });

  it("marks a variable command name as uncertain", () => {
    expect(analyzeCommand("$CMD --force").uncertain).toBe(true);
  });

  it("lists unrecognised commands", () => {
    expect(allUnrecognized(analyzeCommand("frobnicate --now"))).toEqual(["frobnicate"]);
    expect(allUnrecognized(analyzeCommand("ls -la"))).toEqual([]);
  });

  it("needsShell is true for pipes, globs, variables and redirects", () => {
    for (const c of ["a | b", "ls *.txt", "echo $HOME", "echo hi > f", "a && b"]) {
      expect(analyzeCommand(c).needsShell, c).toBe(true);
    }
    expect(analyzeCommand("echo hi").needsShell).toBe(false);
  });

  it("limits nesting depth instead of recursing forever", () => {
    let cmd = "echo hi";
    for (let i = 0; i < 6; i++) cmd = `bash -c ${JSON.stringify(cmd)}`;
    expect(allUncertaintyReasons(analyzeCommand(cmd)).join()).toMatch(/too deep/);
  });

  it("argv mode treats shell metacharacters as literal data", () => {
    const a = analyzeArgv(["echo", "a && rm -rf /", "$HOME"]);
    expect(a.segments).toHaveLength(1);
    expect(a.needsShell).toBe(false);
    expect(a.segments[0].args.map((t) => t.value)).toEqual(["a && rm -rf /", "$HOME"]);
    expect(a.uncertain).toBe(false);
  });

  it("returns an empty analysis for blank input", () => {
    expect(analyzeCommand("   ").segments).toHaveLength(0);
    expect(analyzeArgv([]).segments).toHaveLength(0);
  });
});

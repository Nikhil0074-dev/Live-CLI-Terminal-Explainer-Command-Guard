import { describe, expect, it } from "vitest";
import { expandHome, globBase, guardHome, isCriticalPath, isSystemArea, isWithin, resolveTarget } from "../../src/utils/paths";

describe("paths", () => {
  it("expands ~ and $HOME", () => {
    expect(expandHome("~", "/home/u")).toBe("/home/u");
    expect(expandHome("~/x", "/home/u")).toBe("/home/u/x");
    expect(expandHome("$HOME/x", "/home/u")).toBe("/home/u/x");
    expect(expandHome("${HOME}", "/home/u")).toBe("/home/u");
    expect(expandHome("/etc", "/home/u")).toBe("/etc");
  });

  it("resolves relative paths against cwd", () => {
    expect(resolveTarget("./build", "/p", "/h")).toBe("/p/build");
    expect(resolveTarget("../x", "/p/q", "/h")).toBe("/p/x");
  });

  it("finds the directory a glob ranges over", () => {
    expect(globBase("build/*")).toBe("build");
    expect(globBase("*.log")).toBe(".");
    expect(globBase("/*")).toBe("/");
    expect(globBase("~/*")).toBe("~");
    expect(globBase("plain")).toBe("plain");
  });

  it("isWithin handles equal, child and sibling", () => {
    expect(isWithin("/a", "/a")).toBe(true);
    expect(isWithin("/a", "/a/b/c")).toBe(true);
    expect(isWithin("/a", "/ab")).toBe(false);
    expect(isWithin("/a/b", "/a")).toBe(false);
  });

  it("recognises critical and system paths", () => {
    expect(isCriticalPath("/", "/home/u")).toBe(true);
    expect(isCriticalPath("/home/u", "/home/u")).toBe(true);
    expect(isCriticalPath("/etc", "/home/u")).toBe(true);
    expect(isCriticalPath("/home/u/project", "/home/u")).toBe(false);
    expect(isSystemArea("/etc/nginx/nginx.conf")).toBe(true);
    expect(isSystemArea("/home/u/project")).toBe(false);
  });

  it("guardHome honours GUARD_HOME and XDG_CONFIG_HOME", () => {
    expect(guardHome({ GUARD_HOME: "/x/y" })).toBe("/x/y");
    expect(guardHome({ XDG_CONFIG_HOME: "/cfg", HOME: "/h" })).toBe("/cfg/live-cli-guard");
    expect(guardHome({ HOME: "/h" })).toBe("/h/.config/live-cli-guard");
  });
});

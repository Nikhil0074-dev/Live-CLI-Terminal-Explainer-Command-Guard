import { describe, expect, it } from "vitest";
import { findMatchingParen, joinArgv, shellQuote, tokenize } from "../../src/analyzer/tokenizer";

const words = (s: string) => tokenize(s).segments.map((seg) => seg.tokens.map((t) => t.value));

describe("tokenizer", () => {
  it("splits on whitespace and keeps quoted arguments together", () => {
    expect(words('echo "hello world" foo')).toEqual([["echo", "hello world", "foo"]]);
    expect(words("echo 'a  b'")).toEqual([["echo", "a  b"]]);
  });

  it("handles backslash escapes", () => {
    expect(words("echo a\\ b")).toEqual([["echo", "a b"]]);
  });

  it("splits pipelines and lists into segments with operators", () => {
    const r = tokenize("a | b && c || d ; e & f");
    expect(r.segments.map((s) => s.tokens[0].value)).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(r.operators).toEqual(["|", "&&", "||", ";", "&"]);
    expect(r.segments[1].operatorBefore).toBe("|");
  });

  it("does not split on operators inside quotes", () => {
    expect(tokenize('echo "a && b | c"').segments).toHaveLength(1);
  });

  it("treats newlines as command separators", () => {
    expect(tokenize("ls\npwd").segments).toHaveLength(2);
  });

  it("parses redirections and fd prefixes", () => {
    const seg = tokenize("cmd > out.txt 2>&1 >> log < in.txt").segments[0];
    expect(seg.tokens.map((t) => t.value)).toEqual(["cmd"]);
    expect(seg.redirections.map((x) => x.op)).toEqual([">", "2>&", ">>", "<"]);
    expect(seg.redirections[0].target).toBe("out.txt");
  });

  it("flags variables, substitutions and globs", () => {
    const r = tokenize('rm -rf "$DIR"/*.log $(whoami) `id`');
    expect(r.hasVariables).toBe(true);
    expect(r.hasSubstitution).toBe(true);
    expect(r.substitutions).toEqual(["whoami", "id"]);
    const toks = r.segments[0].tokens;
    expect(toks[2].hasExpansion).toBe(true);
    expect(toks[2].hasGlob).toBe(true);
  });

  it("does not expand inside single quotes", () => {
    const r = tokenize("echo '$HOME $(x)'");
    expect(r.hasVariables).toBe(false);
    expect(r.hasSubstitution).toBe(false);
  });

  it("detects commands hidden in double-quoted substitutions", () => {
    expect(tokenize('echo "$(rm -rf /)"').substitutions).toEqual(["rm -rf /"]);
  });

  it("does not treat arithmetic expansion as command substitution", () => {
    const r = tokenize("echo $((1+2))");
    expect(r.substitutions).toEqual([]);
    expect(r.hasVariables).toBe(true);
  });

  it("reports unterminated quotes instead of guessing", () => {
    expect(tokenize('echo "oops').errors.join()).toMatch(/unterminated double quote/);
    expect(tokenize("echo 'oops").errors.join()).toMatch(/unterminated single quote/);
    expect(tokenize("echo $(oops").errors.join()).toMatch(/unterminated command substitution/);
  });

  it("reports heredocs and grouping", () => {
    expect(tokenize("cat <<EOF").hasHeredoc).toBe(true);
    expect(tokenize("(cd /tmp && ls)").hasGrouping).toBe(true);
  });

  it("ignores comments", () => {
    expect(words("echo hi # rm -rf /")).toEqual([["echo", "hi"]]);
    expect(words("echo a#b")).toEqual([["echo", "a#b"]]);
  });

  it("marks brace expansion as glob-like", () => {
    expect(tokenize("rm {a,b}.txt").segments[0].tokens[1].hasGlob).toBe(true);
  });

  it("findMatchingParen respects nesting and quotes", () => {
    expect(findMatchingParen("$(a (b) c)", 1)).toBe(9);
    expect(findMatchingParen('$(echo ")")', 1)).toBe(10);
    expect(findMatchingParen("$(oops", 1)).toBe(-1);
  });

  it("shellQuote round-trips awkward arguments", () => {
    expect(shellQuote("simple-1.txt")).toBe("simple-1.txt");
    expect(shellQuote("a b")).toBe("'a b'");
    expect(shellQuote("it's")).toBe("'it'\\''s'");
    expect(shellQuote("")).toBe("''");
    const argv = ["rm", "-rf", "my dir", "it's"];
    expect(words(joinArgv(argv))).toEqual([argv]);
  });
});

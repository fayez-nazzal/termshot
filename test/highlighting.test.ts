import { expect, test } from "bun:test";
import { defaultHighlighter } from "../src/highlighting/registry.ts";

const roles = (s: string) =>
  defaultHighlighter()
    .tokenize(s)
    .filter((t) => t.role !== "whitespace")
    .map((t) => [t.text, t.role]);

test("commands after operators", () => {
  expect(roles("bun test && git log --oneline | head -5")).toEqual([
    ["bun", "command"], ["test", "argument"], ["&&", "operator"], ["git", "command"], ["log", "argument"],
    ["--oneline", "flag"], ["|", "operator"], ["head", "command"], ["-5", "flag"],
  ]);
});
test("strings, variables, paths, comments, env prefix", () => {
  expect(roles(`FOO=1 ./run.sh "a b" $HOME ~/x # note`)).toEqual([
    ["FOO=1", "variable"], ["./run.sh", "command"], ['"a b"', "string"], ["$HOME", "variable"], ["~/x", "path"], ["# note", "comment"],
  ]);
});
test("tokens always reassemble to the exact input", () => {
  for (const s of [`echo 'unterminated`, `a|b;c&&d`, `  x  `, `echo "a\\"b" <in >out 2>err`, `echo "a\\`, `echo \${X`, "$", ""]) {
    expect(defaultHighlighter().tokenize(s).map((t) => t.text).join("")).toBe(s);
  }
});
test("rulings: 2> only at word start, mid-word # stays in word, env keeps command position", () => {
  expect(roles("a2>b")).toEqual([["a2", "command"], [">", "operator"], ["b", "argument"]]);
  expect(roles("ls 2>err")).toEqual([["ls", "command"], ["2>", "operator"], ["err", "argument"]]);
  expect(roles("echo a#b")).toEqual([["echo", "command"], ["a#b", "argument"]]);
  expect(roles("A=1 B=2 cmd x")).toEqual([["A=1", "variable"], ["B=2", "variable"], ["cmd", "command"], ["x", "argument"]]);
  expect(roles("echo $? ${X:-y} $1 'a b'")).toEqual([
    ["echo", "command"], ["$?", "variable"], ["${X:-y}", "variable"], ["$1", "variable"], ["'a b'", "string"],
  ]);
  expect(roles("(a); b & c")).toEqual([
    ["(", "operator"], ["a", "command"], [")", "operator"], [";", "operator"], ["b", "command"], ["&", "operator"], ["c", "command"],
  ]);
});

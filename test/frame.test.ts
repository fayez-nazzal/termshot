import { expect, test } from "bun:test";
import type { Token } from "../src/highlighting/highlighter.ts";
import { buildFrame, type FrameCell } from "../src/frame/frame.ts";
import type { Cell, Row } from "../src/terminal-emulation/terminal-emulator.ts";

const blank = { fg: { kind: "default" }, bg: { kind: "default" }, bold: false, dim: false, italic: false, underline: false, inverse: false } as const;
const row = (s: string): Row => [...s.padEnd(10)].map((char): Cell => ({ char, width: 1, ...blank }));
const tok = (text: string): Token => ({ text, role: "command" });
const text = (r: FrameCell[]) => r.filter((c) => c.width !== 0).map((c) => c.char).join("").trimEnd();

test("head line then output", () => {
  const f = buildFrame({ prompt: [{ text: "~ ❯ ", role: "symbol" }], command: [{ text: "ls", role: "command" }], output: [row("a"), row("b")], cols: 10, rows: 30 });
  expect(f.rows.map(text)).toEqual(["~ ❯ ls", "a", "b"]);
  expect(f.rows.every((r) => r.length === 10)).toBe(true);
  expect(f.rows[0]![4]!.fg).toEqual({ kind: "highlight", role: "command" });
});
test("no output gives a one-line frame", () => {
  expect(buildFrame({ prompt: [], command: [tok("true")], output: [], cols: 10, rows: 30 }).rows).toHaveLength(1);
});
test("an empty command still yields one head line", () => {
  expect(buildFrame({ prompt: [], command: [], output: [], cols: 10, rows: 30 }).rows).toHaveLength(1);
});
test("tall output keeps the head and the last lines", () => {
  const out = Array.from({ length: 50 }, (_, i) => row(`l${i}`));
  const f = buildFrame({ prompt: [], command: [tok("x")], output: out, cols: 10, rows: 5 });
  expect(f.rows.map(text)).toEqual(["x", "l46", "l47", "l48", "l49"]);
});
test("a command longer than rows lines is shown whole, output dropped", () => {
  const f = buildFrame({ prompt: [], command: [tok("y".repeat(35))], output: [row("out")], cols: 10, rows: 3 });
  expect(f.rows.map(text)).toEqual(["yyyyyyyyyy", "yyyyyyyyyy", "yyyyyyyyyy", "yyyyy"]);
});
test("wide characters take two cells and wrap whole", () => {
  const f = buildFrame({ prompt: [], command: [tok("abc漢d")], output: [], cols: 4, rows: 30 });
  expect(f.rows.map(text)).toEqual(["abc", "漢d"]);
  expect(f.rows[0]![3]).toMatchObject({ char: " ", width: 1, fg: { kind: "default" } });
  expect(f.rows[1]!.slice(0, 3).map((c) => c.width)).toEqual([2, 0, 1]);
});
test("emoji are not split", () => {
  const f = buildFrame({ prompt: [], command: [tok("👍🏽")], output: [], cols: 4, rows: 30 });
  expect(f.rows.map(text)).toEqual(["👍🏽"]);
});
